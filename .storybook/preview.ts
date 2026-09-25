import type { Preview } from "@storybook/react";
import { createElement, StrictMode } from "react";

const preview: Preview = {
	decorators: [
		// Every story mounts inside StrictMode, so the double-invoke of effects is
		// exercised by the docs and the story test suite rather than discovered in
		// a downstream app. The chart engines are the reason: a create/destroy pair
		// that is not idempotent leaks an instance or throws on the second cleanup.
		// 每个 story 都在 StrictMode 下挂载，让 effect 的双重执行在文档与 story 测试里
		// 就被覆盖，而不是等下游应用去发现。图表引擎正是原因：不成对的创建/销毁会泄漏
		// 实例，或在第二次 cleanup 时抛错。
		(Story) => createElement(StrictMode, null, createElement(Story)),
	],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		layout: "fullscreen",
	},
};

export default preview;
