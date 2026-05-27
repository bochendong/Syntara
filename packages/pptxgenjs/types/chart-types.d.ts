import type PptxGenJS from './index'

type BorderProps = PptxGenJS.BorderProps
type CHART_NAME = PptxGenJS.CHART_NAME
type HexColor = PptxGenJS.HexColor
type ObjectNameProps = PptxGenJS.ObjectNameProps
type PositionProps = PptxGenJS.PositionProps
type ShadowProps = PptxGenJS.ShadowProps
type ShapeFillProps = PptxGenJS.ShapeFillProps
type TextBaseProps = PptxGenJS.TextBaseProps

// charts =========================================================================================
	// FUTURE: BREAKING-CHANGE: (soln: use `OptsDataLabelPosition|string` until 3.5/4.0)
	/*
	export interface OptsDataLabelPosition {
		pie: 'ctr' | 'inEnd' | 'outEnd' | 'bestFit'
		scatter: 'b' | 'ctr' | 'l' | 'r' | 't'
		// TODO: add all othere chart types
	}
	*/

	export type ChartAxisTickMark = 'none' | 'inside' | 'outside' | 'cross'
	export type ChartLineCap = 'flat' | 'round' | 'square'

	export interface OptsChartData {
		//_dataIndex?: number

		/**
		 * category labels
		 * @example ['Year 2000', 'Year 2010', 'Year 2020'] // single-level category axes labels
		 * @example [['Year 2000', 'Year 2010', 'Year 2020'], ['Decades', '', '']] // multi-level category axes labels
		 * @since `labels` string[][] type added v3.11.0
		 */
		labels?: string[] | string[][]
		/**
		 * series name
		 * @example 'Locations'
		 */
		name?: string
		/**
		 * bubble sizes
		 * @example [5, 1, 5, 1]
		 */
		sizes?: number[]
		/**
		 * category values
		 * @example [2000, 2010, 2020]
		 */
		values?: number[]
		/**
		 * Override `chartColors`
		 */
		//color?: string // TODO: WIP: (Pull #727)
	}
	export interface OptsChartGridLine {
		/**
		 * MS-PPT > Chart format > Format Major Gridlines > Line > Cap type
		 * - line cap type
		 * @default flat
		 */
		cap?: ChartLineCap
		/**
		 * Gridline color (hex)
		 * @example 'FF3399'
		 */
		color?: HexColor
		/**
		 * Gridline size (points)
		 */
		size?: number
		/**
		 * Gridline style
		 */
		style?: 'solid' | 'dash' | 'dot' | 'none'
	}
	// TODO: 202008: chart types remain with predicated with "I" in v3.3.0 (ran out of time!)
	export interface IChartMulti {
		type: CHART_NAME
		data: OptsChartData[]
		options: IChartOpts
	}
	export interface IChartPropsFillLine {
		/**
		 * PowerPoint: Format Chart Area/Plot > Border ["Line"]
		 * @example border: {color: 'FF0000', pt: 1} // hex RGB color, 1 pt line
		 */
		border?: BorderProps
		/**
		 * PowerPoint: Format Chart Area/Plot Area > Fill
		 * @example fill: {color: '696969'} // hex RGB color value
		 * @example fill: {color: pptx.SchemeColor.background2} // Theme color value
		 * @example fill: {transparency: 50} // 50% transparency
		 */
		fill?: ShapeFillProps
	}
	export interface IChartAreaProps extends IChartPropsFillLine {
		/**
		 * Whether the chart area has rounded corners
		 * - only applies when either `fill` or `border` is used
		 * @default true
		 * @since v3.11
		 */
		roundedCorners?: boolean
	}
	export interface IChartPropsBase {
		/**
		 * Axis position
		 */
		axisPos?: 'b' | 'l' | 'r' | 't'
		chartColors?: HexColor[]
		/**
		 * opacity (0 - 100)
		 * @example 50 // 50% opaque
		 */
		chartColorsOpacity?: number
		dataBorder?: BorderProps
		displayBlanksAs?: string
		invertedColors?: HexColor[]
		lang?: string
		layout?: PositionProps
		shadow?: ShadowProps
		/**
		 * @default false
		 */
		showLabel?: boolean
		showLeaderLines?: boolean
		/**
		 * @default false
		 */
		showLegend?: boolean
		/**
		 * @default false
		 */
		showPercent?: boolean
		/**
		 * @default false
		 */
		showSerName?: boolean
		/**
		 * @default false
		 */
		showTitle?: boolean
		/**
		 * @default false
		 */
		showValue?: boolean
		/**
		 * 3D Perspecitve
		 * - range: 0-120
		 * @default 30
		 */
		v3DPerspective?: number
		/**
		 * Right Angle Axes
		 * - Shows chart from first-person perspective
		 * - Overrides `v3DPerspective` when true
		 * - PowerPoint: Chart Options > 3-D Rotation
		 * @default false
		 */
		v3DRAngAx?: boolean
		/**
		 * X Rotation
		 * - PowerPoint: Chart Options > 3-D Rotation
		 * - range: 0-359.9
		 * @default 30
		 */
		v3DRotX?: number
		/**
		 * Y Rotation
		 * - range: 0-359.9
		 * @default 30
		 */
		v3DRotY?: number

		/**
		 * PowerPoint: Format Chart Area (Fill & Border/Line)
		 * @since v3.11
		 */
		chartArea?: IChartAreaProps
		/**
		 * PowerPoint: Format Plot Area (Fill & Border/Line)
		 * @since v3.11
		 */
		plotArea?: IChartPropsFillLine

		/**
		 * @deprecated v3.11.0 - use `plotArea.border`
		 */
		border?: BorderProps
		/**
		 * @deprecated v3.11.0 - use `plotArea.fill`
		 */
		fill?: HexColor
	}
	export interface IChartPropsAxisCat {
		/**
		 * Multi-Chart prop: array of cat axes
		 */
		catAxes?: IChartPropsAxisCat[]
		catAxisBaseTimeUnit?: string
		catAxisCrossesAt?: number | 'autoZero'
		catAxisHidden?: boolean
		catAxisLabelColor?: string
		catAxisLabelFontBold?: boolean
		catAxisLabelFontFace?: string
		catAxisLabelFontItalic?: boolean
		catAxisLabelFontSize?: number
		catAxisLabelFrequency?: string
		catAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
		catAxisLabelRotate?: number
		catAxisLineColor?: string
		catAxisLineShow?: boolean
		catAxisLineSize?: number
		catAxisLineStyle?: 'solid' | 'dash' | 'dot'
		catAxisMajorTickMark?: ChartAxisTickMark
		catAxisMajorTimeUnit?: string
		catAxisMajorUnit?: number
		catAxisMaxVal?: number
		catAxisMinorTickMark?: ChartAxisTickMark
		catAxisMinorTimeUnit?: string
		catAxisMinorUnit?: number
		catAxisMinVal?: number
		/** @since v3.11.0 */
		catAxisMultiLevelLabels?: boolean
		catAxisOrientation?: 'minMax'
		catAxisTitle?: string
		catAxisTitleColor?: string
		catAxisTitleFontFace?: string
		catAxisTitleFontSize?: number
		catAxisTitleRotate?: number
		catGridLine?: OptsChartGridLine
		catLabelFormatCode?: string
		/**
		 * Whether data should use secondary category axis (instead of primary)
		 * @default false
		 */
		secondaryCatAxis?: boolean
		showCatAxisTitle?: boolean
	}
	export interface IChartPropsAxisSer {
		serAxisBaseTimeUnit?: string
		serAxisHidden?: boolean
		serAxisLabelColor?: string
		serAxisLabelFontBold?: boolean
		serAxisLabelFontFace?: string
		serAxisLabelFontItalic?: boolean
		serAxisLabelFontSize?: number
		serAxisLabelFrequency?: string
		serAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
		serAxisLineColor?: string
		serAxisLineShow?: boolean
		serAxisMajorTimeUnit?: string
		serAxisMajorUnit?: number
		serAxisMinorTimeUnit?: string
		serAxisMinorUnit?: number
		serAxisOrientation?: string
		serAxisTitle?: string
		serAxisTitleColor?: string
		serAxisTitleFontFace?: string
		serAxisTitleFontSize?: number
		serAxisTitleRotate?: number
		serGridLine?: OptsChartGridLine
		serLabelFormatCode?: string
		showSerAxisTitle?: boolean
	}
	export interface IChartPropsAxisVal {
		/**
		 * Whether data should use secondary value axis (instead of primary)
		 * @default false
		 */
		secondaryValAxis?: boolean
		showValAxisTitle?: boolean
		/**
		 * Multi-Chart prop: array of val axes
		 */
		valAxes?: IChartPropsAxisVal[]
		valAxisCrossesAt?: number | 'autoZero'
		valAxisDisplayUnit?: 'billions' | 'hundredMillions' | 'hundreds' | 'hundredThousands' | 'millions' | 'tenMillions' | 'tenThousands' | 'thousands' | 'trillions'
		valAxisDisplayUnitLabel?: boolean
		valAxisHidden?: boolean
		valAxisLabelColor?: string
		valAxisLabelFontBold?: boolean
		valAxisLabelFontFace?: string
		valAxisLabelFontItalic?: boolean
		valAxisLabelFontSize?: number
		valAxisLabelFormatCode?: string
		valAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
		valAxisLabelRotate?: number
		valAxisLineColor?: string
		valAxisLineShow?: boolean
		valAxisLineSize?: number
		valAxisLineStyle?: 'solid' | 'dash' | 'dot'
		/**
		 * PowerPoint: Format Axis > Axis Options > Logarithmic scale - Base
		 * - range: 2-99
		 * @since v3.5.0
		 */
		valAxisLogScaleBase?: number
		valAxisMajorTickMark?: ChartAxisTickMark
		valAxisMajorUnit?: number
		valAxisMaxVal?: number
		valAxisMinorTickMark?: ChartAxisTickMark
		valAxisMinVal?: number
		valAxisOrientation?: 'minMax'
		valAxisTitle?: string
		valAxisTitleColor?: string
		valAxisTitleFontFace?: string
		valAxisTitleFontSize?: number
		valAxisTitleRotate?: number
		valGridLine?: OptsChartGridLine
		/**
		 * Value label format code
		 * - this also directs Data Table formatting
		 * @since v3.3.0
		 * @example '#%' // round percent
		 * @example '0.00%' // shows values as '0.00%'
		 * @example '$0.00' // shows values as '$0.00'
		 */
		valLabelFormatCode?: string
	}
	export interface IChartPropsChartBar {
		bar3DShape?: string
		barDir?: string
		barGapDepthPct?: number
		/**
		 * MS-PPT > Format chart > Format Data Point > Series Options >  "Gap Width"
		 * - width (percent)
		 * - range: `0`-`500`
		 * @default 150
		 */
		barGapWidthPct?: number
		barGrouping?: string
		/**
		 * MS-PPT > Format chart > Format Data Point > Series Options >  "Series Overlap"
		 * - overlap (percent)
		 * - range: `-100`-`100`
		 * @since v3.9.0
		 * @default 0
		 */
		barOverlapPct?: number
	}
	export interface IChartPropsChartDoughnut {
		dataNoEffects?: boolean
		holeSize?: number
	}
	export interface IChartPropsChartLine {
		/**
		 * MS-PPT > Chart format > Format Data Series > Line > Cap type
		 * - line cap type
		 * @default flat
		 */
		lineCap?: ChartLineCap
		/**
		 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Type
		 * - line dash type
		 * @default solid
		 */
		lineDash?: 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'solid' | 'sysDash' | 'sysDot'
		/**
		 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Type
		 * - marker type
		 * @default circle
		 */
		lineDataSymbol?: 'circle' | 'dash' | 'diamond' | 'dot' | 'none' | 'square' | 'triangle'
		/**
		 * MS-PPT > Chart format > Format Data Series > [Marker Options] > Border > Color
		 * - border color
		 * @default circle
		 */
		lineDataSymbolLineColor?: string
		/**
		 * MS-PPT > Chart format > Format Data Series > [Marker Options] > Border > Width
		 * - border width (points)
		 * @default 0.75
		 */
		lineDataSymbolLineSize?: number
		/**
		 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Size
		 * - marker size
		 * - range: 2-72
		 * @default 6
		 */
		lineDataSymbolSize?: number
		/**
		 * MS-PPT > Chart format > Format Data Series > Line > Width
		 * - line width (points)
		 * - range: 0-1584
		 * @default 2
		 */
		lineSize?: number
		/**
		 * MS-PPT > Chart format > Format Data Series > Line > Smoothed line
		 * - "Smoothed line"
		 * @default false
		 */
		lineSmooth?: boolean
	}
	export interface IChartPropsChartPie {
		dataNoEffects?: boolean
		/**
		 * MS-PPT > Format chart > Format Data Series > Series Options >  "Angle of first slice"
		 * - angle (degrees)
		 * - range: 0-359
		 * @since v3.4.0
		 * @default 0
		 */
		firstSliceAng?: number
	}
	export interface IChartPropsChartRadar {
		/**
		 * MS-PPT > Chart Type > Waterfall
		 * - radar chart type
		 * @default standard
		 */
		radarStyle?: 'standard' | 'marker' | 'filled' // TODO: convert to 'radar'|'markers'|'filled' in 4.0 (verbatim with PPT app UI)
	}
	export interface IChartPropsDataLabel {
		dataLabelBkgrdColors?: boolean
		dataLabelColor?: string
		dataLabelFontBold?: boolean
		dataLabelFontFace?: string
		dataLabelFontItalic?: boolean
		dataLabelFontSize?: number
		/**
		 * Data label format code
		 * @example '#%' // round percent
		 * @example '0.00%' // shows values as '0.00%'
		 * @example '$0.00' // shows values as '$0.00'
		 */
		dataLabelFormatCode?: string
		dataLabelFormatScatter?: 'custom' | 'customXY' | 'XY'
		dataLabelPosition?: 'b' | 'bestFit' | 'ctr' | 'l' | 'r' | 't' | 'inEnd' | 'outEnd'
	}
	export interface IChartPropsDataTable {
		dataTableFontSize?: number
		/**
		 * Data table format code
		 * @since v3.3.0
		 * @example '#%' // round percent
		 * @example '0.00%' // shows values as '0.00%'
		 * @example '$0.00' // shows values as '$0.00'
		 */
		dataTableFormatCode?: string
		/**
		 * Whether to show a data table adjacent to the chart
		 * @default false
		 */
		showDataTable?: boolean
		showDataTableHorzBorder?: boolean
		showDataTableKeys?: boolean
		showDataTableOutline?: boolean
		showDataTableVertBorder?: boolean
	}
	export interface IChartPropsLegend {
		legendColor?: string
		legendFontFace?: string
		legendFontSize?: number
		legendPos?: 'b' | 'l' | 'r' | 't' | 'tr'
	}
	export interface IChartPropsTitle extends TextBaseProps {
		title?: string
		titleAlign?: string
		titleBold?: boolean
		titleColor?: string
		titleFontFace?: string
		titleFontSize?: number
		titlePos?: { x: number, y: number }
		titleRotate?: number
	}
	export interface IChartOpts
		extends IChartPropsAxisCat,
		IChartPropsAxisSer,
		IChartPropsAxisVal,
		IChartPropsBase,
		IChartPropsChartBar,
		IChartPropsChartDoughnut,
		IChartPropsChartLine,
		IChartPropsChartPie,
		IChartPropsChartRadar,
		IChartPropsDataLabel,
		IChartPropsDataTable,
		IChartPropsLegend,
		IChartPropsTitle,
		ObjectNameProps,
		OptsChartGridLine,
		PositionProps {
		/**
		 * Alt Text value ("How would you describe this object and its contents to someone who is blind?")
		 * - PowerPoint: [right-click on a chart] > "Edit Alt Text..."
		 */
		altText?: string
	}
	export interface ISlideRelChart extends OptsChartData {
		type: CHART_NAME | IChartMulti[]
		opts: IChartOpts
		data: OptsChartData[]
		// internal below
		//rId: number
		//Target: string
		//globalId: number
		//fileName: string
	}
