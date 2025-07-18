/**
 * Construct a form data with the submitter value.
 * It utilizes the submitter argument on the FormData constructor from modern browsers
 * with fallback to append the submitter value in case it is not unsupported.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/FormData/FormData#parameters
 */
export function getFormData(
	form: HTMLFormElement,
	submitter?: HTMLInputElement | HTMLButtonElement | null,
): FormData {
	const payload = new FormData(form, submitter);

	if (submitter && submitter.type === 'submit' && submitter.name !== '') {
		const entries = payload.getAll(submitter.name);

		// This assumes the submitter value to be always unique, which should be fine in most cases
		if (!entries.includes(submitter.value)) {
			payload.append(submitter.name, submitter.value);
		}
	}

	return payload;
}

/**
 * Returns the paths from a name based on the JS syntax convention
 * @example
 * ```js
 * const paths = getPaths('todos[0].content'); // ['todos', 0, 'content']
 * ```
 */
export function getPaths(name: string | undefined): Array<string | number> {
	if (!name) {
		return [];
	}

	return name
		.split(/\.|(\[\d*\])/)
		.reduce<Array<string | number>>((result, segment) => {
			if (
				typeof segment !== 'undefined' &&
				segment !== '' &&
				segment !== '__proto__' &&
				segment !== 'constructor' &&
				segment !== 'prototype'
			) {
				if (segment.startsWith('[') && segment.endsWith(']')) {
					const index = segment.slice(1, -1);

					result.push(Number(index));
				} else {
					result.push(segment);
				}
			}
			return result;
		}, []);
}

/**
 * Returns a formatted name from the paths based on the JS syntax convention
 * @example
 * ```js
 * const name = formatPaths(['todos', 0, 'content']); // "todos[0].content"
 * ```
 */
export function formatPaths(paths: Array<string | number>): string {
	return paths.reduce<string>((name, path) => {
		if (typeof path === 'number') {
			return `${name}[${Number.isNaN(path) ? '' : path}]`;
		}

		if (name === '' || path === '') {
			return [name, path].join('');
		}

		return [name, path].join('.');
	}, '');
}

/**
 * Format based on a prefix and a path
 */
export function formatName(prefix: string | undefined, path?: string | number) {
	return typeof path !== 'undefined'
		? formatPaths([...getPaths(prefix), path])
		: prefix ?? '';
}

/**
 * Check if a name match the prefix paths
 */
export function isPrefix(name: string, prefix: string) {
	const paths = getPaths(name);
	const prefixPaths = getPaths(prefix);

	return (
		paths.length >= prefixPaths.length &&
		prefixPaths.every((path, index) => paths[index] === path)
	);
}

/**
 * Compare the parent and child paths to get the relative paths
 * Returns null if the child paths do not start with the parent paths
 */
export function getChildPaths(
	parentNameOrPaths: string | Array<string | number>,
	childName: string,
) {
	const parentPaths =
		typeof parentNameOrPaths === 'string'
			? getPaths(parentNameOrPaths)
			: parentNameOrPaths;
	const childPaths = getPaths(childName);

	if (
		childPaths.length >= parentPaths.length &&
		parentPaths.every((path, index) => childPaths[index] === path)
	) {
		return childPaths.slice(parentPaths.length);
	}

	return null;
}

/**
 * Assign a value to a target object by following the paths
 */
export function setValue(
	target: Record<string, any>,
	name: string,
	valueFn: (currentValue?: unknown) => unknown,
) {
	const paths = getPaths(name);
	const length = paths.length;
	const lastIndex = length - 1;

	let index = -1;
	let pointer = target;

	while (pointer != null && ++index < length) {
		const key = paths[index] as string | number;
		const nextKey = paths[index + 1];
		const newValue =
			index != lastIndex
				? Object.prototype.hasOwnProperty.call(pointer, key) &&
					pointer[key] !== null
					? pointer[key]
					: typeof nextKey === 'number'
						? []
						: {}
				: valueFn(pointer[key]);

		pointer[key] = newValue;
		pointer = pointer[key];
	}
}

/**
 * Retrive the value from a target object by following the paths
 */
export function getValue(target: unknown, name: string): unknown {
	let pointer = target;

	for (const path of getPaths(name)) {
		if (typeof pointer === 'undefined' || pointer == null) {
			break;
		}

		if (!Object.prototype.hasOwnProperty.call(pointer, path)) {
			return;
		}

		if (isPlainObject(pointer) && typeof path === 'string') {
			pointer = pointer[path];
		} else if (Array.isArray(pointer) && typeof path === 'number') {
			pointer = pointer[path];
		} else {
			return;
		}
	}

	return pointer;
}

/**
 * Check if the value is a plain object
 */
export function isPlainObject(
	obj: unknown,
): obj is Record<string | number | symbol, unknown> {
	return (
		!!obj &&
		obj.constructor === Object &&
		Object.getPrototypeOf(obj) === Object.prototype
	);
}

type GlobalConstructors = {
	[K in keyof typeof globalThis]: (typeof globalThis)[K] extends new (
		...args: any
	) => any
		? K
		: never;
}[keyof typeof globalThis];

export function isGlobalInstance<ClassName extends GlobalConstructors>(
	obj: unknown,
	className: ClassName,
): obj is InstanceType<(typeof globalThis)[ClassName]> {
	const Ctor = globalThis[className];
	return typeof Ctor === 'function' && obj instanceof Ctor;
}

/**
 * Normalize value by removing empty object or array, empty string and null values
 */
export function normalize<Type extends Record<string, unknown>>(
	value: Type,
	acceptFile?: boolean,
): Type | undefined;
export function normalize<Type extends Array<unknown>>(
	value: Type,
	acceptFile?: boolean,
): Type | undefined;
export function normalize(
	value: unknown,
	acceptFile?: boolean,
): unknown | undefined;
export function normalize<
	Type extends Record<string, unknown> | Array<unknown>,
>(
	value: Type,
	acceptFile = true,
): Record<string, unknown> | Array<unknown> | undefined {
	if (isPlainObject(value)) {
		const obj = Object.keys(value)
			.sort()
			.reduce<Record<string, unknown>>((result, key) => {
				const data = normalize(value[key], acceptFile);

				if (typeof data !== 'undefined') {
					result[key] = data;
				}

				return result;
			}, {});

		if (Object.keys(obj).length === 0) {
			return;
		}

		return obj;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return undefined;
		}

		return value.map((item) => normalize(item, acceptFile));
	}

	if (
		(typeof value === 'string' && value === '') ||
		value === null ||
		(isGlobalInstance(value, 'File') && (!acceptFile || value.size === 0))
	) {
		return;
	}

	return value;
}

/**
 * Flatten a tree into a dictionary
 */
export function flatten(
	data: unknown,
	options: {
		resolve?: (data: unknown) => unknown;
		prefix?: string;
	} = {},
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const resolve = options.resolve ?? ((data) => data);

	function process(data: unknown, prefix: string) {
		const value = normalize(resolve(data));

		if (typeof value !== 'undefined') {
			result[prefix] = value;
		}

		if (Array.isArray(data)) {
			for (let i = 0; i < data.length; i++) {
				process(data[i], `${prefix}[${i}]`);
			}
		} else if (isPlainObject(data)) {
			for (const [key, value] of Object.entries(data)) {
				process(value, prefix ? `${prefix}.${key}` : key);
			}
		}
	}

	if (data) {
		process(data, options.prefix ?? '');
	}

	return result;
}

export function deepEqual<Value>(prev: Value, next: Value): boolean {
	if (prev === next) {
		return true;
	}

	if (!prev || !next) {
		return false;
	}

	if (Array.isArray(prev) && Array.isArray(next)) {
		if (prev.length !== next.length) {
			return false;
		}

		for (let i = 0; i < prev.length; i++) {
			if (!deepEqual(prev[i], next[i])) {
				return false;
			}
		}

		return true;
	}

	if (isPlainObject(prev) && isPlainObject(next)) {
		const prevKeys = Object.keys(prev);
		const nextKeys = Object.keys(next);

		if (prevKeys.length !== nextKeys.length) {
			return false;
		}

		for (const key of prevKeys) {
			if (
				!Object.prototype.hasOwnProperty.call(next, key) ||
				// @ts-expect-error FIXME
				!deepEqual(prev[key], next[key])
			) {
				return false;
			}
		}

		return true;
	}

	return false;
}
