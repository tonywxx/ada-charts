/**
 * A story's props written as the JSX a consumer would copy — the "Show code"
 * panel beside a canvas, derived from the args that canvas is really running
 * with.
 *
 * The two alternatives the docs offer are worse in opposite directions.
 * `<AdaChart {...args} />` says nothing about what `args` holds, so the panel
 * cannot answer the one question a reader has: which props produced this? And
 * the automatically generated source stringifies whatever the story's `render`
 * returns — for a live story that is its renderer, named after the renderer and
 * carrying the renderer's own props rather than the chart's.
 *
 * Props equal to the component's documented default are dropped. They are the
 * other half of the same panel — the Controls table beside it — and printing all
 * thirty of them would bury the three that matter.
 *
 * 把某个 story 的属性写成使用方会复制的 JSX —— 画布旁边那块 “Show code” 面板，由这张画布
 * 真正在用的 args 派生而来。
 *
 * 文档默认给的两种替代品朝相反的方向都不好：`<AdaChart {...args} />` 丝毫没有说明 `args` 里
 * 是什么，于是这块面板回答不了读者唯一的问题 —— 是哪几个属性产生了眼前这张图？而自动生成的源码
 * 序列化的是 story `render` 返回的东西 —— 对实时 story 而言那是它的渲染器：名字是渲染器的，
 * 带的属性也是渲染器自己的，而不是图表的。
 *
 * 等于组件有文档的默认值的属性会被略去：它们是同一块面板的另一半 —— 旁边的 Controls 表 ——
 * 把三十项全印出来只会埋掉真正要紧的那三项。
 */

/**
 * Turns one story's merged args into the snippet: `args` is what the story runs
 * with (its own overrides already merged over the meta defaults), and
 * `defaults` is the table those defaults came from, so it is also the thing to
 * subtract. A story that overrides nothing prints `<Tag />`, which is the truth
 * about it.
 *
 * 把某个 story 合并后的 args 变成片段：`args` 是它运行所用的那组（自身的覆盖已并到 meta 默认值
 * 之上），`defaults` 是那些默认值的来源表，因此也是要减掉的东西。什么都没覆盖的 story 印出
 * `<Tag />`，而这就是关于它的实话。
 */
export function jsxSource(tag: string, args: object, defaults: object): string {
	const props = Object.entries(args).flatMap(([name, value]) => {
		if (name in defaults) {
			const fallback = (defaults as Record<string, unknown>)[name];
			if (JSON.stringify(value) === JSON.stringify(fallback)) return [];
		}
		if (typeof value === "string") return [`${name}=${jsxString(value)}`];
		const printed = jsxValue(value, 2);
		return printed === null ? [] : [`${name}={${printed}}`];
	});
	return props.length === 0 ? `<${tag} />` : `<${tag}\n  ${props.join("\n  ")}\n/>`;
}

/** A top-level string prop as JSX writes attributes — `theme="dark"`, or in braces when the value itself holds a quote. 顶层字符串属性按 JSX 写属性的方式 —— `theme="dark"`；值本身含引号时改用花括号。 */
function jsxString(value: string): string {
	return value.includes('"') || value.includes("\n") ? `{${JSON.stringify(value)}}` : `"${value}"`;
}

/**
 * One arg as JSX would write it: keys bare, strings quoted, and a container kept
 * on a single line while every entry fits on one and the result stays short — so
 * a three-prop pane reads as `{ id: "macd_pane", height: 80 }` and a list of them
 * stacks. A value that cannot be written at all (a function, `undefined`) answers
 * `null`, and the caller drops the prop rather than printing something untrue.
 *
 * `indent` is the column the value is being written at, so the lines it opens
 * close back at that column.
 *
 * 某个 arg 写成 JSX 的样子：键不加引号、字符串加引号，容器在「每个条目都单行且整体不长」时保持
 * 同行 —— 于是一个三项的面板读作 `{ id: "macd_pane", height: 80 }`，一组面板则逐行堆叠。写不出
 * 来的值（函数、`undefined`）回答 `null`，调用方随即丢掉这个属性，而不是印一样不真的东西。
 *
 * `indent` 是这个值落笔的列，因此它张开的行也收在这一列。
 */
function jsxValue(value: unknown, indent: number): string | null {
	if (typeof value === "string") return JSON.stringify(value);
	if (value === null || typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (typeof value !== "object") return null;

	if (Array.isArray(value)) {
		const items = value.map((item) => jsxValue(item, indent + 2));
		if (items.some((item) => item === null)) return null;
		return stacked(items as string[], "[", "]", indent);
	}
	const entries = Object.entries(value).flatMap(([name, item]) => {
		const printed = jsxValue(item, indent + 2);
		return printed === null ? [] : [`${jsxKey(name)}: ${printed}`];
	});
	return stacked(entries, "{", "}", indent);
}

/** A container on one line while every entry is one line and the whole stays short, stacked otherwise. 每个条目都单行、整体也不长时容器同行，否则逐行堆叠。 */
function stacked(entries: string[], open: string, close: string, indent: number): string {
	const flat = `${open}${entries.join(", ")}${close}`;
	if (entries.every((entry) => !entry.includes("\n")) && flat.length <= 60) return flat;
	const pad = " ".repeat(indent + 2);
	const lines = entries.map((entry) => `${pad}${entry}`);
	return `${open}\n${lines.join(",\n")}\n${" ".repeat(indent)}${close}`;
}

/** An object key as JSX writes it: bare when it is a plain identifier, quoted when it is not. 写成 JSX 的对象键：普通标识符不加引号，其余加引号。 */
function jsxKey(name: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}