import Executor, { Config, Events } from './Executor';
import { normalizePathEnding } from '../common/util';
import { RuntimeEnvironment } from '../types';
import Task from '@dojo/core/async/Task';
import global from '@dojo/core/global';
import Html from '../reporters/Html';
import Dom from '../reporters/Dom';
import ConsoleReporter from '../reporters/Console';

const console: Console = global.console;

/**
 * A Browser executor is used to run unit tests in a browser.
 */
export default class Browser extends Executor<Events, Config> {
	constructor(config?: Partial<Config>) {
		super(<Config>{
			basePath: '/',
			internPath: global.location.pathname
		});

		// Report uncaught errors
		global.addEventListener('unhandledRejection', (event: PromiseRejectionEvent) => {
			console.warn('Unhandled rejection:', event);
			this.emit('error', event.reason);
		});

		global.addEventListener('error', (event: ErrorEvent) => {
			console.warn('Unhandled error:', event);
			const error = new Error(event.message);
			error.stack = `${event.filename}:${event.lineno}:${event.colno}`;
			this.emit('error', error);
		});

		this.registerPlugin('reporter', 'html', () => Html);
		this.registerPlugin('reporter', 'dom', () => Dom);
		this.registerPlugin('reporter', 'console', () => ConsoleReporter);

		if (config) {
			this.configure(config);
		}
	}

	get environment(): RuntimeEnvironment {
		return 'browser';
	}

	/**
	 * Load scripts using a global 'require' function or via script injection
	 *
	 * @param script a path to a script
	 */
	loadScript(script: string | string[]) {
		if (script == null) {
			return Task.resolve();
		}

		if (typeof script === 'string') {
			script = [script];
		}

		// If a global require is available, use that
		const load = global.require || injectScript;

		return script.reduce((previous, script) => {
			if (script[0] !== '/') {
				script = `${this.config.basePath}${script}`;
			}
			return previous.then(() => load(script));
		}, Task.resolve());
	}

	protected _resolveConfig() {
		return super._resolveConfig().then(() => {
			const config = this.config;

			if (!config.internPath) {
				config.internPath = 'node_modules/intern/';
			}

			// Filter out globs from suites and browser suites
			[ config.suites, config.browser.suites ].forEach(suites => {
				suites.forEach(suite => {
					if (/[*?]/.test(suite)) {
						throw new Error(`Globs may not be used for browser suites: "${suite}"`);
					}
				});
			});

			[ 'basePath', 'internPath' ].forEach((key: keyof Config) => {
				config[key] = normalizePathEnding(<string>config[key]);
			});

			if (config.internPath[0] !== '/') {
				config.internPath = `${config.basePath}${config.internPath}`;
			}
		});
	}
}

export { Events, Config };

function injectScript(path: string) {
	return new Task<void>((resolve, reject) => {
		const doc: Document = global.document;
		const scriptTag = doc.createElement('script');
		scriptTag.addEventListener('load', () => {
			resolve();
		});
		scriptTag.addEventListener('error', event => {
			console.error(`Error loading ${path}:`, event);
			reject(new Error(`Unable to load ${path}`));
		});
		scriptTag.src = path;
		doc.body.appendChild(scriptTag);
	});
}
