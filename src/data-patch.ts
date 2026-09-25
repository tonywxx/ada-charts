/**
 * What actually happened to a dataset between two renders — decided once, in the
 * open, instead of being re-guessed from array length and first timestamp at
 * every call site.
 *
 * The module deliberately does not look at props, style, or identity of the
 * containing array: two calls with equal items and equal order are `none` even
 * if the caller passed a brand-new array. That is what lets a Wrapper react to
 * data without also reacting to an unrelated re-render.
 *
 * 两次渲染之间数据集到底发生了什么 —— 集中判断一次，而不是在每个调用点都从数组长度
 * 和首个时间戳再猜一遍。
 *
 * 本模块刻意不看 props、样式，也不看外层数组的引用：只要各项相等且顺序一致就是 `none`，
 * 即使调用方换了个新数组。这正是 Wrapper 能对数据作出响应、而不被无关重渲染带动的原因。
 */

export type DataPatch<T> =
	| { kind: "none" }
	/** The last existing item changed and nothing was added. 末项变了，没有新增。 */
	| { kind: "update"; item: T }
	/** Existing items are untouched; these were added after them. 已有各项未变，其后新增了这些。 */
	| { kind: "append"; items: T[] }
	/** Anything else: the whole set must be supplied again. 其他情况：整段重新灌入。 */
	| { kind: "replace"; items: T[] };

/**
 * Compares the two datasets item by item. `sameItem` must cover every field the
 * chart draws, or a refreshed bar will be mistaken for `none` — the failure
 * direction this module exists to close is `replace` being missed, never
 * `replace` being chosen too often.
 *
 * 逐项比较两份数据集。`sameItem` 必须覆盖图表会绘制的所有字段，否则刷新过的
 * 一根会被误判成 `none` —— 本模块要堵的失误方向是漏掉 `replace`，而不是多判 `replace`。
 */
export function decideDataPatch<T>(
	previous: readonly T[],
	next: readonly T[],
	sameItem: (a: T, b: T) => boolean,
): DataPatch<T> {
	if (previous.length === 0) {
		return next.length === 0 ? { kind: "none" } : { kind: "replace", items: [...next] };
	}

	if (next.length === 0 || next.length < previous.length) {
		return { kind: "replace", items: [...next] };
	}

	let firstChanged = -1;
	for (let i = 0; i < previous.length; i += 1) {
		if (!sameItem(previous[i], next[i])) {
			firstChanged = i;
			break;
		}
	}

	if (firstChanged === -1) {
		return next.length === previous.length
			? { kind: "none" }
			: { kind: "append", items: next.slice(previous.length) };
	}

	// Only the newest bar moved, and no bars arrived: the cheap in-place push.
	// 只有最新一根动了、且没有新增：可以走廉价的末项原地更新。
	if (firstChanged === previous.length - 1 && next.length === previous.length) {
		return { kind: "update", item: next[next.length - 1] };
	}

	return { kind: "replace", items: [...next] };
}
