/**
 * The structural signature of a declarative list — indicators, panes or
 * overlays — so a reconcile effect can tell "the set changed" from "the same
 * props were handed over again".
 *
 * The whitelist is the contract, and each field is here because changing it
 * changes what has to be built, not merely how it looks:
 *
 * - `name`, `id`, `paneId`, `stack` decide which study exists and where it
 *   lands. `stack` is not cosmetic: without it a main-pane indicator opens a
 *   pane of its own (ADR-0003).
 * - `calcParams`, `height`, `order` change the shape of what is created.
 * - `points` is overlay geometry. A different anchor is a different drawing, so
 *   it rebuilds — and because it is here, anchoring a declarative tool to
 *   *history* rather than to the live series is what keeps a tool from being
 *   rebuilt on every push.
 *
 * Non-structural fields stay out on purpose (ADR-0003): `visible`, `styles`,
 * `lock` and `mode` are owned by the engine once the thing exists — the user
 * toggles or drags them — and rebuilding to apply them would throw away that
 * state.
 *
 * The function lives apart from `adachart-options.ts` because that module
 * registers engine overlays on import and cannot be loaded without a DOM; this
 * one is pure and is tested directly.
 *
 * 一份声明式清单（指标、面板或画线）的结构签名，使协调 effect 能区分「组合变了」与「同一份
 * props 又传了一遍」。
 *
 * 白名单就是契约，每个字段在此的理由是：改变它会改变要建立的东西，而不只是它的样子：
 *
 * - `name`、`id`、`paneId`、`stack` 决定存在哪个指标、落在哪里。`stack` 不是外观：缺了它，
 *   主图指标会自开一个面板（ADR-0003）。
 * - `calcParams`、`height`、`order` 改变所建立之物的形状。
 * - `points` 是画线的几何。不同的锚点就是另一幅画，因此它会触发重建 —— 也正因为它在白名单里，
 *   把声明式工具锚在*历史*而不是实时序列上，才能让工具不因每一次推送而重建。
 *
 * 非结构字段刻意留在外面（ADR-0003）：`visible`、`styles`、`lock`、`mode` 在对象建立之后归
 * 引擎所有 —— 由用户切换或拖动 —— 为应用它们而重建会丢掉那份状态。
 *
 * 本函数独立于 `adachart-options.ts`，因为那个模块在 import 时注册引擎画线、离开 DOM 无法加载；
 * 这一个是纯函数，可直接测试。
 */
export function structuralKey(
	items: ReadonlyArray<unknown> | undefined,
): string {
	return JSON.stringify(
		(items ?? []).map((item) => {
			if (typeof item === "string") return item;
			const record = item as Record<string, unknown>;
			const out: Record<string, unknown> = {};
			if ("name" in record) out.name = record.name;
			if ("paneId" in record) out.paneId = record.paneId;
			if ("id" in record) out.id = record.id;
			if ("calcParams" in record) out.calcParams = record.calcParams;
			if ("height" in record) out.height = record.height;
			if ("order" in record) out.order = record.order;
			if ("stack" in record) out.stack = record.stack;
			if ("points" in record) out.points = record.points;
			return out;
		}),
	);
}
