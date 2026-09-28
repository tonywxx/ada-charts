/**
 * Every string the Pro chrome needs, in one catalogue.
 *
 * The chart's own labels come from `klinecharts`' locale catalogue; this table
 * only names the things this layer draws itself — the toolbar buttons, the
 * dialogs and their fields. It lives apart from any one component because the
 * toolbar and the dialogs both draw from it, and two tables would drift.
 *
 * Pro 外围所需的全部文案，集中一张表。
 *
 * 图表的文案来自 `klinecharts` 自己的词条库；本表只命名这一层自己绘制的东西 —— 工具栏按钮、
 * 各对话框及其字段。它独立于任何单个组件，因为工具栏与对话框都从它取值，两张表必然漂移。
 */
const MESSAGES: Record<string, Record<string, string>> = {
	"en-US": {
		menu: "Drawing Bar",
		search: "Search",
		indicators: "Indicators",
		main: "Main",
		sub: "Sub",
		noResults: "No matches",
		theme: "Theme",
		timezone: "Timezone",
		settings: "Settings",
		screenshot: "Screenshot",
		fullScreen: "Full Screen",
		exitFullScreen: "Exit Full Screen",
		save: "Save",
		close: "Close",
		confirm: "Confirm",
		candleType: "Candle type",
		candle_solid: "Solid",
		candle_stroke: "Stroke",
		candle_up_stroke: "Up stroke",
		candle_down_stroke: "Down stroke",
		ohlc: "OHLC",
		area: "Area",
		lastPriceShow: "Last price",
		highPriceShow: "High price",
		lowPriceShow: "Low price",
		indicatorLastValueShow: "Indicator last value",
		reverseCoordinate: "Reverse axis",
		gridShow: "Grid",
		parameter: "Parameter",
		lineColor: "Line colour",
		loading: "Loading",
		empty: "No data",
		indicatorSettings: "Indicator settings",
	},
	"zh-CN": {
		menu: "画线栏",
		search: "搜索",
		indicators: "指标",
		main: "主图",
		sub: "副图",
		noResults: "无匹配",
		theme: "主题",
		timezone: "时区",
		settings: "设置",
		screenshot: "截屏",
		fullScreen: "全屏",
		exitFullScreen: "退出全屏",
		save: "保存",
		close: "关闭",
		confirm: "确定",
		candleType: "蜡烛样式",
		candle_solid: "实心",
		candle_stroke: "空心",
		candle_up_stroke: "上涨空心",
		candle_down_stroke: "下跌空心",
		ohlc: "OHLC",
		area: "面积",
		lastPriceShow: "最新价",
		highPriceShow: "最高价",
		lowPriceShow: "最低价",
		indicatorLastValueShow: "指标最新值",
		reverseCoordinate: "反转坐标",
		gridShow: "网格",
		parameter: "参数",
		lineColor: "线颜色",
		loading: "加载中",
		empty: "暂无数据",
		indicatorSettings: "指标设置",
	},
};

/**
 * One message, falling back to `en-US` and then to the key itself: a missing
 * translation should show English rather than nothing, and a missing key should
 * show its own name rather than an empty box.
 *
 * 取一条文案，依次回退到 `en-US`、再回退到键名本身：缺翻译时应当显示英文而不是空白，
 * 缺键时应当显示键名而不是一个空框。
 */
export function messageFor(locale: string, key: string): string {
	return MESSAGES[locale]?.[key] ?? MESSAGES["en-US"][key] ?? key;
}