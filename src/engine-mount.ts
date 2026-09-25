import { useCallback, useEffect, useRef } from "react";

/**
 * The mount half of every `Wrapper`: attach an engine to a container, take it
 * down again, and keep a single honest answer to "is this engine still live?".
 *
 * Each Wrapper supplies its own `create` and `destroy` — the engines really do
 * differ — but the ordering rule enforced here is the one all three were each
 * re-deriving wrongly: React runs cleanups in declaration order, so an effect
 * written after the mount always tears down against an engine that is already
 * gone. Guarding on liveness turns that into a no-op instead of a throw.
 *
 * 每个 Wrapper 的挂载部分：把引擎装进容器、再拆掉，并对「这个引擎还活着吗」给出唯一
 * 一份诚实答案。
 *
 * create / destroy 各家自己提供（三套引擎确实不同），但这里强制执行的顺序规则，正是
 * 三个文件各自都推错的那条：React 按声明顺序执行 cleanup，所以写在挂载之后的 effect
 * 一定会在引擎已消失之后才拆除。判活把它从抛错变成空操作。
 */
export interface EngineMountOptions<T> {
	/**
	 * Build the engine into an already-attached container. Return `null` when
	 * there is nothing to build; the mount is then simply empty, and the effects
	 * that read {@link EngineMount.engine} stay inert.
	 *
	 * 在已挂载的容器里构建引擎。无可建时返回 `null`，本次挂载即为空，读
	 * {@link EngineMount.engine} 的 effect 保持不生效。
	 */
	create: (container: HTMLDivElement) => T | null;
	/** Take the engine down. Runs once per mount. 拆除引擎。每次挂载执行一次。 */
	destroy: (engine: T) => void;
	/**
	 * Called whenever the container changes size. Omit it when the engine resizes
	 * itself: `TChart` leaves this to lightweight-charts' `autoSize`, and giving it
	 * an observer as well would start a fight over the canvas dimensions.
	 *
	 * 容器尺寸变化时调用。引擎能自适时的就不要传：`TChart` 交给 lightweight-charts 的
	 * `autoSize`，这里再多一层 observer 只会两边抢 canvas 尺寸。
	 */
	resize?: (engine: T) => void;
}

export interface EngineMount<T> {
	/** Give this to the chart `<div>` as its `ref`. 作为 `ref` 交给图表 `<div>`。 */
	setContainer: (container: HTMLDivElement | null) => void;
	/**
	 * The live engine, or `null` before mount and after teardown.
	 *
	 * A function rather than a ref box on purpose: an effect that captured an
	 * engine writes `engine() !== captured` in its cleanup, which reads as the
	 * question it is actually asking — "is this still mine?"
	 *
	 * 之所以是函数而不是 ref 盒子：effect 在自己的 cleanup 里写 `engine() !== captured`，
	 * 读起来正好就是它在问的问题 ——「这个还是我的吗」。
	 */
	engine: () => T | null;
}

/**
 * Creates the engine once per mount. `create`, `destroy` and `resize` are read
 * when the effect runs and later identities are ignored on purpose — the
 * Wrappers already park their live props behind a mutable mirror, and re-running
 * the mount because a closure was rebuilt would rebuild the chart.
 */
export function useEngineMount<T>(options: EngineMountOptions<T>): EngineMount<T> {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const engineRef = useRef<T | null>(null);
	const optionsRef = useRef(options);

	// Reading `.current` inside these two is legitimate: they run from an effect, a
	// cleanup, or React's own ref callback — never during render. Handing back
	// functions rather than the ref boxes keeps that boundary visible to callers
	// and to the rules of hooks.
	// 在这两个函数里读 `.current` 是正当的：它们只在 effect、cleanup 或 React 自己的 ref
	// 回调里运行，不在渲染期。交出函数而不是 ref 盒子，这条边界对调用方和 hooks 规则都更清楚。
	const setContainer = useCallback((container: HTMLDivElement | null) => {
		containerRef.current = container;
	}, []);
	const engine = useCallback(() => engineRef.current, []);

	// Declared before the mount effect so the first commit already sees the
	// current props, without the mount depending on anything volatile.
	// 声明在挂载 effect 之前，使首次提交就能读到最新 props，而挂载本身不依赖任何易变项。
	useEffect(() => {
		optionsRef.current = options;
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const instance = optionsRef.current.create(container);
		if (!instance) return;
		engineRef.current = instance;

		const { resize } = optionsRef.current;
		let observer: ResizeObserver | undefined;
		if (resize) {
			observer = new ResizeObserver(() => {
				if (engineRef.current === instance) resize(instance);
			});
			observer.observe(container);
		}

		return () => {
			observer?.disconnect();
			// Withdraw the engine before destroying it, so every effect declared after
			// this one can notice in its own cleanup instead of finding out by throwing.
			// 先撤回引用、再销毁引擎，好让本 effect 之后声明的每个 effect 都能在自己的
			// cleanup 里自己发现，而不是靠抛错才知道。
			engineRef.current = null;
			optionsRef.current.destroy(instance);
		};
	}, []);

	return { setContainer, engine };
}
