import { describe, expect, it } from "vitest";
import type { ADACHART_BUILT_IN_INDICATORS } from "./adachart-options";
import {
	addSubPane,
	DEFAULT_CONFIG,
	indicatorsFor,
	MAIN_INDICATORS,
	panesFor,
	removeSubPane,
	setSubPaneIndicator,
	SUB_INDICATORS,
	SUB_PANE_HEIGHT,
	toggleMainIndicator,
	VOLUME_OVERLAY_INDICATOR,
	type WindowConfig,
} from "./adachart-window-config";

/**
 * The per-window indicator configuration: which studies stack on the candles and
 * which panes are drawn below them.
 *
 * Every reducer here is a value transform, and that is the first thing asserted
 * rather than assumed. The panel drives React state, the window recomputes its
 * chart props off the config's *identity*, so a reducer that edited in place
 * would leave the memo holding a stale tree — a bug with no error and no wrong
 * number, only studies that stop following the panel. Freezing the config makes
 * any such write throw instead of quietly succeeding.
 *
 * What is deliberately not here: the panel's own state (is it open), the
 * `useMemo`s that call these functions, and the fact that a config survives
 * changing a window's period — that last one is a claim about the grid keying
 * `configs` by window id while the window remounts, i.e. about React and not
 * about this model. That path is checked in the story, against a rendered chart.
 *
 * 每个窗口的指标配置：哪些指标叠加在蜡烛上，下方画哪些面板。
 *
 * 这里的每个 reducer 都是值变换，而这是首先被断言而非被假定的事。面板驱动 React state，窗口以
 * 配置的*引用*为依赖重算图表 props，因此就地修改的 reducer 会让记忆化抱住一棵过期的树 —— 那是一个
 * 不报错、也不给出错误数字的 bug，只是指标不再跟着面板走。把配置冻结起来，这类写入便会抛错，而不是
 * 悄悄成功。
 *
 * 刻意不在此处的：面板自身的状态（是否展开）、调用这些函数的 `useMemo`，以及「配置在改周期后仍在」
 * 这件事 —— 后者是关于网格按窗口 id 存 `configs`、而窗口会重挂的主张，也就是说，是关于 React 而非
 * 关于这个模型的。那条路径在 story 里对着渲染出的图表检查。
 */

/**
 * The engine's own list, named as a *type*. The module that holds it imports
 * `klinecharts` for `registerOverlay`, and that package needs a `window` this
 * environment has not got, so the list can be referred to here but not loaded.
 *
 * 引擎自己的那份清单，以*类型*方式命名。持有它的模块为 `registerOverlay` 引入了 `klinecharts`，
 * 而那个包需要本环境没有的 `window`，因此这份清单能在这里被引用，却不能被加载。
 */
type EngineIndicator = (typeof ADACHART_BUILT_IN_INDICATORS)[number];

/** A name the engine ships that neither list offers. 引擎提供、两份清单却都没收的名称。 */
type Unclassified = Exclude<
	EngineIndicator,
	(typeof MAIN_INDICATORS)[number] | (typeof SUB_INDICATORS)[number]
>;

/**
 * `true`, and `never` the moment the claim stops holding: an indicator added to
 * `klinecharts` that nobody classified would leave `Unclassified` non-empty, this
 * type would collapse to `never`, and the `true` below would stop compiling —
 * `tsc -b` runs in the build. That is the point of putting it here. A study
 * missing from the panel is one nobody can reach, and nothing else would say so.
 *
 * `true`；一旦该主张不再成立就变成 `never`：`klinecharts` 新增一个没人归类的指标会让
 * `Unclassified` 非空，这个类型便塌成 `never`，下面的 `true` 随之无法通过编译 —— 构建里会跑
 * `tsc -b`。把它放在这里的意义正在于此：面板里缺席的指标是谁也够不着的指标，而除此以外没有任何
 * 东西会出声。
 */
type EveryEngineIndicatorIsOffered = Unclassified extends never ? true : never;
const everyEngineIndicatorIsOffered: EveryEngineIndicatorIsOffered = true;

describe("indicatorsFor", () => {
	it("stacks a main-pane study on the candles and gives a sub study a pane of its own", () => {
		expect(indicatorsFor(DEFAULT_CONFIG)).toStrictEqual([
			{ name: "EMA", stack: true },
			{ name: VOLUME_OVERLAY_INDICATOR, stack: true },
			{ name: "MACD", paneId: "macd_pane" },
		]);
	});

	it("keeps the panel's order: the main studies first, then the panes as listed", () => {
		const config: WindowConfig = {
			main: ["BOLL", "SAR"],
			panes: [
				{ id: "macd_pane", indicator: "MACD" },
				{ id: "rsi_pane", indicator: "RSI" },
			],
		};
		expect(indicatorsFor(config)).toStrictEqual([
			{ name: "BOLL", stack: true },
			{ name: "SAR", stack: true },
			{ name: "MACD", paneId: "macd_pane" },
			{ name: "RSI", paneId: "rsi_pane" },
		]);
	});

	it("offers every indicator the engine ships", () => {
		expect(everyEngineIndicatorIsOffered).toBe(true);
	});
});

describe("panesFor", () => {
	it("gives every pane the id it is addressed by in the panel, and one shared height", () => {
		const config: WindowConfig = {
			main: [],
			panes: [
				{ id: "vol_pane", indicator: "VOL" },
				{ id: "macd_pane", indicator: "MACD" },
			],
		};
		expect(panesFor(config)).toStrictEqual([
			{ id: "vol_pane", height: SUB_PANE_HEIGHT },
			{ id: "macd_pane", height: SUB_PANE_HEIGHT },
		]);
	});

	it("is empty for a window with no panes, rather than inventing one", () => {
		expect(panesFor({ main: ["MA"], panes: [] })).toEqual([]);
	});
});

describe("DEFAULT_CONFIG", () => {
	it("opens on the engine's EMA with the volume overlay over the candles, and MACD below", () => {
		expect(DEFAULT_CONFIG).toStrictEqual({
			main: ["EMA", VOLUME_OVERLAY_INDICATOR],
			panes: [{ id: "macd_pane", indicator: "MACD" }],
		});
	});

	it("offers the volume overlay the default opens on", () => {
		expect([...MAIN_INDICATORS]).toContain(VOLUME_OVERLAY_INDICATOR);
	});
});

describe("toggleMainIndicator", () => {
	it("adds a study the window is not showing", () => {
		expect(toggleMainIndicator(DEFAULT_CONFIG, "BOLL").main).toEqual([
			"EMA",
			VOLUME_OVERLAY_INDICATOR,
			"BOLL",
		]);
	});

	it("takes away a study it is showing, leaving the others in order", () => {
		const config = toggleMainIndicator(DEFAULT_CONFIG, "BOLL");
		expect(toggleMainIndicator(config, "EMA").main).toEqual([VOLUME_OVERLAY_INDICATOR, "BOLL"]);
	});

	it("leaves the panes exactly as they were", () => {
		expect(toggleMainIndicator(DEFAULT_CONFIG, "EMA").panes).toEqual(DEFAULT_CONFIG.panes);
	});
});

describe("addSubPane", () => {
	it("appends the pane on the first sub study the window is not already showing", () => {
		const added = addSubPane(DEFAULT_CONFIG, "pane_1");
		expect(added.panes.at(-1)).toEqual({ id: "pane_1", indicator: "VOL" });
		// The pane that was there keeps its place and its indicator.
		// 原有的面板保持原位与原有指标。
		expect(added.panes[0]).toEqual(DEFAULT_CONFIG.panes[0]);
	});

	it("carries the id it was given, so the panel can go on addressing the pane", () => {
		expect(addSubPane(DEFAULT_CONFIG, "pane_7").panes.at(-1)?.id).toBe("pane_7");
	});

	it("walks the list as panes accumulate rather than repeating one name", () => {
		const one = addSubPane(DEFAULT_CONFIG, "pane_1");
		const two = addSubPane(one, "pane_2");
		// The k-th pane added takes the k-th name: the window shows MACD already, so
		// the one that follows is the next in the list, and the one after that the
		// next again.
		// 第 k 个添加的面板取清单里第 k 个名称：窗口已显示 MACD，因此随后两个就是清单里的后两个。
		expect(one.panes.at(-1)?.indicator).toBe(SUB_INDICATORS[0]);
		expect(two.panes.at(-1)?.indicator).toBe(SUB_INDICATORS[2]);
	});

	it("still returns a pane once every sub study is taken", () => {
		const every: WindowConfig = {
			main: [],
			panes: SUB_INDICATORS.map((indicator, index) => ({ id: `pane_${index}`, indicator })),
		};
		const added = addSubPane(every, "pane_extra");
		expect(added.panes).toHaveLength(SUB_INDICATORS.length + 1);
		expect(added.panes.at(-1)).toEqual({ id: "pane_extra", indicator: SUB_INDICATORS[0] });
	});
});

describe("setSubPaneIndicator", () => {
	const two: WindowConfig = {
		main: ["MA"],
		panes: [
			{ id: "vol_pane", indicator: "VOL" },
			{ id: "macd_pane", indicator: "MACD" },
		],
	};

	it("points the named pane at another study", () => {
		expect(setSubPaneIndicator(two, "macd_pane", "KDJ").panes[1]).toEqual({
			id: "macd_pane",
			indicator: "KDJ",
		});
	});

	it("leaves the other panes, their order and the main studies alone", () => {
		const changed = setSubPaneIndicator(two, "macd_pane", "KDJ");
		expect(changed.panes[0]).toEqual(two.panes[0]);
		expect(changed.panes).toHaveLength(2);
		expect(changed.main).toEqual(two.main);
	});

	it("changes nothing when the pane id is not there", () => {
		expect(setSubPaneIndicator(two, "nope", "KDJ").panes).toEqual(two.panes);
	});
});

describe("removeSubPane", () => {
	const two: WindowConfig = {
		main: ["MA", "BOLL"],
		panes: [
			{ id: "vol_pane", indicator: "VOL" },
			{ id: "macd_pane", indicator: "MACD" },
		],
	};

	it("drops the named pane and nothing else", () => {
		expect(removeSubPane(two, "vol_pane").panes).toEqual([{ id: "macd_pane", indicator: "MACD" }]);
	});

	it("can empty the panes while the main studies stay", () => {
		const empty = removeSubPane(removeSubPane(two, "vol_pane"), "macd_pane");
		expect(empty.panes).toEqual([]);
		expect(empty.main).toEqual(["MA", "BOLL"]);
	});

	it("changes nothing when the pane id is not there", () => {
		expect(removeSubPane(two, "nope").panes).toEqual(two.panes);
	});
});

describe("the reducers", () => {
	/**
	 * A config deep enough to catch a write: freezing the arrays and each pane,
	 * not only the object holding them, because a reducer that pushed onto
	 * `config.panes` would otherwise succeed quietly. ES modules are strict, so
	 * the write throws rather than being ignored.
	 *
	 * 冻结得足够深、能抓住就地写入的配置：数组与每个面板都冻结，而不只是持有它们的那个对象，否则
	 * 一个往 `config.panes` 上 push 的 reducer 仍会悄悄成功。ESM 是严格模式，因此写入会抛错，
	 * 而不是被忽略。
	 */
	function frozen(config: WindowConfig): WindowConfig {
		for (const pane of config.panes) Object.freeze(pane);
		Object.freeze(config.panes);
		Object.freeze(config.main);
		return Object.freeze(config);
	}

	const moves = (config: WindowConfig) => [
		() => toggleMainIndicator(config, "BOLL"),
		() => addSubPane(config, "pane_1"),
		() => setSubPaneIndicator(config, "vol_pane", "RSI"),
		() => removeSubPane(config, "vol_pane"),
	];

	it("return a new config, so a memo keyed on the old one recomputes", () => {
		const config = DEFAULT_CONFIG;
		for (const move of moves(config)) expect(move()).not.toBe(config);
	});

	it("never write to the config they were given", () => {
		const config = frozen({ ...DEFAULT_CONFIG, main: [...DEFAULT_CONFIG.main], panes: DEFAULT_CONFIG.panes.map((pane) => ({ ...pane })) });
		for (const move of moves(config)) expect(move).not.toThrow();
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it("keep the two study lists free of duplicates and of each other's names", () => {
		const main: string[] = [...MAIN_INDICATORS];
		const sub: string[] = [...SUB_INDICATORS];
		expect(new Set(main).size).toBe(main.length);
		expect(new Set(sub).size).toBe(sub.length);
		expect(main.filter((name) => sub.includes(name))).toEqual([]);
	});
});