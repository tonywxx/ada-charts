import { type ComponentType, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The drawing umbrella flag's contract: what the two drawing surfaces answer to.
 *
 * `drawing` and `drawingBarVisible` are not two names for one thing, and the
 * difference only shows up in the state where they disagree — the bar hidden by
 * the reader, versus drawing not being part of this chart at all. In the second
 * state `drawingBarVisible` is still `true`, so anything that reads it alone
 * leaves a pressed toggle pointing at a bar that does not exist. That is why the
 * cases below turn drawing *off* while leaving the visibility prop at its
 * default, and why the toolbar's toggle is asserted to go in that case rather
 * than merely be unpressed.
 *
 * The manager is the other half: it is a panel that accounts for what has been
 * drawn, so it cannot outlive the surface that draws. Its own flag stays
 * independent — a chart that can be drawn on need not offer the panel — but it
 * can only ever narrow the umbrella, never widen it. Hence the third case: both
 * flags on, only the umbrella off.
 *
 * 画线总开关的契约：两个画线界面各回答什么。
 *
 * `drawing` 与 `drawingBarVisible` 不是同一件事的两个名字，差别只在两者不一致的状态下显现 ——
 * 栏被读者藏起来，与「这张图表根本不画线」。在后一种状态下 `drawingBarVisible` 仍是 `true`，
 * 因此只看它的代码会留下一个按亮着、却指向一条并不存在的栏的开关。这就是下面几个用例在把画线
 * *关掉*的同时让可见性属性保持默认值的原因，也是工具栏那个开关在此状态下被断言为*消失*、
 * 而不仅仅是「未按下」的原因。
 *
 * 管理器是另一半：它是一块清点已画内容的面板，因此不能比负责绘制的那层活得久。它自己的开关保持
 * 独立 —— 能画线的图表不必提供这块面板 —— 但它只能收窄总开关，永远无法放宽。因此有第三个用例：
 * 两个开关都开，只把总开关关掉。
 */

type AdaChartProComponent = ComponentType<Record<string, unknown>>;

let AdaChartPro: AdaChartProComponent;

beforeAll(async () => {
	// `klinecharts` reads `window.navigator.userAgent` while its module loads
	// (`isAppleOS`, for the hotkey alias), and this project's `unit` environment is
	// node. Stubbing that one global is what lets the real component render here.
	//
	// `klinecharts` 在模块加载期会读 `window.navigator.userAgent`（`isAppleOS`，用于快捷键
	// 别名），而本项目的 `unit` 环境是 node。把这一个全局补上，真实组件就能在此渲染。
	(globalThis as { window?: unknown }).window = {
		navigator: { userAgent: "node" },
	};
	const module = await import("./AdaChartPro");
	AdaChartPro = module.default as AdaChartProComponent;
});

function renderPro(props: Record<string, unknown>): string {
	return renderToStaticMarkup(createElement(AdaChartPro, props));
}

/** The drawing bar's own class, which only exists while the bar is rendered. 画线栏自身的类名，只在栏被渲染时存在。 */
const BAR = "adachart-pro__drawing-bar";
/** The toolbar's toggle for that bar, named by its message. 工具栏上控制那条栏的开关，以其文案命名。 */
const TOGGLE = 'aria-label="Drawing Bar"';
/** The manager's entry, named by its message. 管理器的入口，以其文案命名。 */
const MANAGER = ">Drawings<";

describe("the drawing umbrella flag", () => {
	it("shows the bar, its toggle and the manager entry when drawing is on", () => {
		const markup = renderPro({ drawingManager: true });
		expect(markup).toContain(BAR);
		expect(markup).toContain(TOGGLE);
		expect(markup).toContain(MANAGER);
	});

	it("removes both drawing surfaces when drawing is off, though the bar was never hidden", () => {
		// `drawingBarVisible` is deliberately left at its default `true`: the point is
		// that the umbrella is not the visibility flag, and a toggle reading it alone
		// would still be on screen here.
		//
		// 有意让 `drawingBarVisible` 保持默认的 `true`：要点是总开关不是可见性开关，只看可见性的
		// 开关在这个状态下还会留在屏幕上。
		const markup = renderPro({ drawing: false, drawingManager: true });
		expect(markup).not.toContain(BAR);
		expect(markup).not.toContain(TOGGLE);
		expect(markup).not.toContain(MANAGER);
	});

	it("leaves the toggle when only the bar is hidden, so the two switches stay distinct", () => {
		const markup = renderPro({ drawingBarVisible: false, drawingManager: true });
		expect(markup).not.toContain(BAR);
		expect(markup).toContain(TOGGLE);
		// The toggle reports the state it controls rather than the umbrella, so it is
		// unpressed here and pressable again.
		//
		// 这个开关汇报的是它控制的状态而不是总开关，因此这里未按下、且可以再按下去。
		expect(markup).toMatch(/aria-label="Drawing Bar"[^>]*aria-pressed="false"/);
		// The manager is the drawing surface's other half, not the bar's: hiding the
		// bar does not take the panel away.
		//
		// 管理器是画线界面、而不是画线栏的另一半：藏起栏不会拿走面板。
		expect(markup).toContain(MANAGER);
	});

	it("narrows the manager rather than widening it — its own flag can only subtract", () => {
		const off = renderPro({ drawingManager: false });
		expect(off).not.toContain(MANAGER);
		// The bar and its toggle are untouched by the manager's flag.
		// 管理器的开关不碰画线栏与它的开关。
		expect(off).toContain(BAR);
		expect(off).toContain(TOGGLE);
	});
});