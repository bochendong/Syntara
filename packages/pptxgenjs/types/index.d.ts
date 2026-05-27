// Type definitions for pptxgenjs 4.0.1
// Project: https://gitbrent.github.io/PptxGenJS/
// Definitions by: Brent Ely <https://github.com/gitbrent/>
//                 Michael Beaumont <https://github.com/michaelbeaumont>
//                 Nicholas Tietz-Sokolsky <https://github.com/ntietz>
//                 David Adams <https://github.com/iota-pi>
//                 Stephen Cronin <https://github.com/cronin4392>
// TypeScript Version: 3.x

import * as ChartTypes from './chart-types'
import * as ShapeTypes from './shape-types'

export as namespace PptxGenJS

export default PptxGenJS

declare class PptxGenJS {
	/**
	 * PptxGenJS Library Version
	 * @type {string}
	 */
	readonly version: string

	// Exposed prop types
	readonly presLayout: PptxGenJS.PresLayout
	readonly AlignH: typeof PptxGenJS.AlignH
	readonly AlignV: typeof PptxGenJS.AlignV
	readonly ChartType: typeof PptxGenJS.ChartType
	readonly OutputType: typeof PptxGenJS.OutputType
	readonly SchemeColor: typeof PptxGenJS.SchemeColor
	readonly ShapeType: typeof PptxGenJS.ShapeType
	readonly PlaceholderType: typeof PptxGenJS.PLACEHOLDER_TYPES

	// Presentation Props

	/**
	 * Presentation layout name.
	 * Standard layouts:
	 * - 'LAYOUT_4x3'   (10" x 7.5")
	 * - 'LAYOUT_16x9'  (10" x 5.625")
	 * - 'LAYOUT_16x10' (10" x 6.25")
	 * - 'LAYOUT_WIDE'  (13.33" x 7.5")
	 *
	 * Custom layouts:
	 * - Use `pptx.defineLayout()` to create custom layouts (e.g.: 'A4')
	 *
	 * @type {string}
	 * @see https://support.office.com/en-us/article/Change-the-size-of-your-slides-040a811c-be43-40b9-8d04-0de5ed79987e
	 */
	layout: string
	/**
	 * Whether Right-to-Left (RTL) mode is enabled
	 * @type {boolean}
	 */
	rtlMode: boolean

	// Presentation Metadata
	/**
	 * Author name
	 * @type {string}
	 */
	author: string
	/**
	 * Comapny name
	 * @type {string}
	 */
	company: string
	/**
	 * @type {string}
	 * @note the `revision` value must be a whole number only (without "." or "," - otherwise, PowerPoint will throw errors upon opening!)
	 */
	revision: string
	/**
	 * Presentation subject
	 * @type {string}
	 */
	subject: string
	/**
	 * Presentation theme (default fonts)
	 * @type {ThemeProps}
	 */
	theme: PptxGenJS.ThemeProps
	/**
	 * Presentation name
	 * @type {string}
	 */
	title: string

	// Methods

	/**
	 * Export the current Presentation to stream
	 * @param {WriteBaseProps} props output properties
	 * @returns {Promise<string | ArrayBuffer | Blob | Uint8Array>} file stream
	 */
	stream(props?: PptxGenJS.WriteBaseProps): Promise<string | ArrayBuffer | Blob | Uint8Array>
	/**
	 * Export the current Presentation as JSZip content with the selected type
	 * @param {WriteProps} props output properties
	 * @returns {Promise<string | ArrayBuffer | Blob | Uint8Array>} file content in selected type
	 */
	write(props?: PptxGenJS.WriteProps): Promise<string | ArrayBuffer | Blob | Uint8Array>
	/**
	 * Export the current Presentation. Writes file to local file system if `fs` exists, otherwise, initiates download in browsers
	 * @param {WriteFileProps} props output file properties
	 * @example pptx.writeFile({ fileName:'CustomerReport.pptx' }) // export presentation as "CustomerReport.pptx"
	 * @example pptx.writeFile({ fileName:'CustomerReport.pptx', compression:true }) // export presentation as "CustomerReport.pptx" compressed (can save up to 30%)
	 * @returns {Promise<string>} the presentation name
	 */
	writeFile(props?: PptxGenJS.WriteFileProps): Promise<string>
	/**
	 * Add a new Section to Presentation
	 * @param {SectionProps} props section properties
	 * @example pptx.addSection({ title:'Charts' });
	 */
	addSection(props: PptxGenJS.SectionProps): void
	/**
	 * Add a new Slide to Presentation
	 * @param {AddSlideProps} props slide options
	 * @returns {Slide} the new Slide
	 */
	addSlide(props?: PptxGenJS.AddSlideProps): PptxGenJS.Slide
	/**
	 * Add a new Slide to Presentation
	 * @param {string} masterName master slide name
	 * @returns {Slide} the new Slide
	 * @deprecated use `addSlide(IAddSlideOptions)`
	 */
	addSlide(masterName?: string): PptxGenJS.Slide
	/**
	 * Create a custom Slide Layout in any size
	 * @param {PresLayout} layout an object with user-defined w/h
	 * @example pptx.defineLayout({ name:'A3', width:16.5, height:11.7 });
	 */
	defineLayout(layout: PptxGenJS.PresLayout): void
	/**
	 * Create a new slide master [layout] for the Presentation
	 * @param {SlideMasterProps} props layout definition
	 */
	defineSlideMaster(props: PptxGenJS.SlideMasterProps): void
	/**
	 * Reproduces an HTML table as a PowerPoint table - including column widths, style, etc. - creates 1 or more slides as needed
	 * @param {string} eleId table HTML element ID
	 * @param {TableToSlidesProps} props generation options
	 */
	tableToSlides(eleId: string, props?: PptxGenJS.TableToSlidesProps): void
}

declare namespace PptxGenJS {
	// Exported enums for module apps
	// @example: pptxgen.ShapeType.rect
	export enum AlignH {
		'left' = 'left',
		'center' = 'center',
		'right' = 'right',
		'justify' = 'justify',
	}
	export enum AlignV {
		'top' = 'top',
		'middle' = 'middle',
		'bottom' = 'bottom',
	}
	export enum ChartType {
		'area' = 'area',
		'bar' = 'bar',
		'bar3d' = 'bar3D',
		'bubble' = 'bubble',
		'bubble3d' = 'bubble3D',
		'doughnut' = 'doughnut',
		'line' = 'line',
		'pie' = 'pie',
		'radar' = 'radar',
		'scatter' = 'scatter',
	}
	export enum OutputType {
		'arraybuffer' = 'arraybuffer',
		'base64' = 'base64',
		'binarystring' = 'binarystring',
		'blob' = 'blob',
		'nodebuffer' = 'nodebuffer',
		'uint8array' = 'uint8array',
	}
	/**
	 * TODO: FUTURE: v4.0: rename to `SchemeColor`
	 */
	export enum SchemeColor {
		'text1' = 'tx1',
		'text2' = 'tx2',
		'background1' = 'bg1',
		'background2' = 'bg2',
		'accent1' = 'accent1',
		'accent2' = 'accent2',
		'accent3' = 'accent3',
		'accent4' = 'accent4',
		'accent5' = 'accent5',
		'accent6' = 'accent6',
	}
	export import ShapeType = ShapeTypes.ShapeType
	// used by charts, shape, text
	export interface BorderOptions {
		/**
		 * Border type
		 */
		type?: 'none' | 'dash' | 'solid'
		/**
		 * Border color (hex)
		 * @example 'FF3399'
		 */
		color?: HexColor
		/**
		 * Border size (points)
		 */
		pt?: number
	}
	// These are used by browser/script clients and have been named like this since v0.1.
	// Desc: charts and shapes for `pptxgen.charts.` `pptxgen.shapes.`
	// Note: "charts" and "shapes" are manually created by cloning
	export enum charts {
		'AREA' = 'area',
		'BAR' = 'bar',
		'BAR3D' = 'bar3D',
		'BUBBLE' = 'bubble',
		'DOUGHNUT' = 'doughnut',
		'LINE' = 'line',
		'PIE' = 'pie',
		'RADAR' = 'radar',
		'SCATTER' = 'scatter',
	}
	export import shapes = ShapeTypes.shapes

	// @source `core-enums.ts`
	export type JSZIP_OUTPUT_TYPE = 'arraybuffer' | 'base64' | 'binarystring' | 'blob' | 'nodebuffer' | 'uint8array'
	export type WRITE_OUTPUT_TYPE = JSZIP_OUTPUT_TYPE | 'STREAM'
	export enum CHART_TYPE {
		'AREA' = 'area',
		'BAR' = 'bar',
		'BAR3D' = 'bar3D',
		'BUBBLE' = 'bubble',
		'DOUGHNUT' = 'doughnut',
		'LINE' = 'line',
		'PIE' = 'pie',
		'RADAR' = 'radar',
		'SCATTER' = 'scatter',
	}
	export enum SCHEME_COLOR_NAMES {
		'TEXT1' = 'tx1',
		'TEXT2' = 'tx2',
		'BACKGROUND1' = 'bg1',
		'BACKGROUND2' = 'bg2',
		'ACCENT1' = 'accent1',
		'ACCENT2' = 'accent2',
		'ACCENT3' = 'accent3',
		'ACCENT4' = 'accent4',
		'ACCENT5' = 'accent5',
		'ACCENT6' = 'accent6',
	}

	// @source `core-interfaces.d.ts` (via import)
	// @code `import { CHART_NAME, PLACEHOLDER_TYPES, SHAPE_NAME, SLIDE_OBJECT_TYPES, TEXT_HALIGN, TEXT_VALIGN, WRITE_OUTPUT_TYPE } from './core-enums'`
	export type CHART_NAME = 'area' | 'bar' | 'bar3D' | 'bubble' | 'doughnut' | 'line' | 'pie' | 'radar' | 'scatter'
	export enum PLACEHOLDER_TYPES {
		'title' = 'title',
		'body' = 'body',
		'image' = 'pic',
		'chart' = 'chart',
		'table' = 'tbl',
		'media' = 'media',
	}
	export type PLACEHOLDER_TYPE = 'title' | 'body' | 'pic' | 'chart' | 'tbl' | 'media'

	export type SHAPE_NAME = ShapeTypes.SHAPE_NAME

	export enum SLIDE_OBJECT_TYPES {
		'chart' = 'chart',
		'hyperlink' = 'hyperlink',
		'image' = 'image',
		'media' = 'media',
		'online' = 'online',
		'placeholder' = 'placeholder',
		'table' = 'table',
		'tablecell' = 'tablecell',
		'text' = 'text',
		'notes' = 'notes',
		'formula' = 'formula',
	}
	export enum TEXT_HALIGN {
		'left' = 'left',
		'center' = 'center',
		'right' = 'right',
		'justify' = 'justify',
	}
	export enum TEXT_VALIGN {
		'b' = 'b',
		'ctr' = 'ctr',
		't' = 't',
	}

	// @source `core-interfaces.d.ts` (direct)
	// Core Types
	// ==========

	/**
	 * Coordinate number - either:
	 * - Inches (0-n)
	 * - Percentage (0-100)
	 *
	 * @example 10.25 // coordinate in inches
	 * @example '75%' // coordinate as percentage of slide size
	 */
	export type Coord = number | `${number}%`
	export interface PositionProps {
		/**
		 * Horizontal position
		 * - inches or percentage
		 * @example 10.25 // position in inches
		 * @example '75%' // position as percentage of slide size
		 */
		x?: Coord
		/**
		 * Vertical position
		 * - inches or percentage
		 * @example 10.25 // position in inches
		 * @example '75%' // position as percentage of slide size
		 */
		y?: Coord
		/**
		 * Height
		 * - inches or percentage
		 * @example 10.25 // height in inches
		 * @example '75%' // height as percentage of slide size
		 */
		h?: Coord
		/**
		 * Width
		 * - inches or percentage
		 * @example 10.25 // width in inches
		 * @example '75%' // width as percentage of slide size
		 */
		w?: Coord
	}
	/**
	 * Either `data` or `path` is required
	 */
	export interface DataOrPathProps {
		/**
		 * URL or relative path
		 *
		 * @example 'https://onedrives.com/myimg.png` // retrieve image via URL
		 * @example '/home/gitbrent/images/myimg.png` // retrieve image via local path
		 */
		path?: string
		/**
		 * base64-encoded string
		 * - Useful for avoiding potential path/server issues
		 *
		 * @example 'image/png;base64,iVtDafDrBF[...]=' // pre-encoded image in base-64
		 */
		data?: string
	}
	export interface BackgroundProps extends DataOrPathProps, ShapeFillProps {
		/**
		 * Color (hex format)
		 * @deprecated v3.6.0 - use `ShapeFillProps` instead
		 */
		fill?: HexColor

		/**
		 * source URL
		 * @deprecated v3.6.0 - use `DataOrPathProps` instead - remove in v4.0.0
		 */
		src?: string
	}
	/**
	 * Color in Hex format
	 * @example 'FF3399'
	 */
	export type HexColor = string
	export type ThemeColor = 'tx1' | 'tx2' | 'bg1' | 'bg2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6'
	export type Color = HexColor | ThemeColor
	export type Margin = number | [number, number, number, number]
	export type HAlign = 'left' | 'center' | 'right' | 'justify'
	export type VAlign = 'top' | 'middle' | 'bottom'

	// used by charts, shape, text
	export interface BorderProps {
		/**
		 * Border type
		 * @default solid
		 */
		type?: 'none' | 'dash' | 'solid'
		/**
		 * Border color (hex)
		 * @example 'FF3399'
		 * @default '666666'
		 */
		color?: HexColor

		// TODO: add `transparency` prop to Borders (0-100%)

		// TODO: add `width` - deprecate `pt`
		/**
		 * Border size (points)
		 * @default 1
		 */
		pt?: number
	}
	// used by: image, object, text,
	export interface HyperlinkProps {
		//_rId: number
		/**
		 * Slide number to link to
		 */
		slide?: number
		/**
		 * Url to link to
		 */
		url?: string
		/**
		 * Hyperlink Tooltip
		 */
		tooltip?: string
	}
	// used by: chart, text, image
	export interface ShadowProps {
		/**
		 * shadow type
		 * @default 'none'
		 */
		type: 'outer' | 'inner' | 'none'
		/**
		 * opacity (percent)
		 * - range: 0.0-1.0
		 * @example 0.5 // 50% opaque
		 */
		opacity?: number // TODO: "Transparency (0-100%)" in PPT // TODO: deprecate and add `transparency`
		/**
		 * blur (points)
		 * - range: 0-100
		 * @default 0
		 */
		blur?: number
		/**
		 * angle (degrees)
		 * - range: 0-359
		 * @default 0
		 */
		angle?: number
		/**
		 * shadow offset (points)
		 * - range: 0-200
		 * @default 0
		 */
		offset?: number // TODO: "Distance" in PPT
		/**
		 * shadow color (hex format)
		 * @example 'FF3399'
		 */
		color?: HexColor
		/**
		 * whether to rotate shadow with shape
		 * @default false
		 */
		rotateWithShape?: boolean
	}
	// used by: shape, table, text
	export interface ShapeFillProps {
		/**
		 * Fill color
		 * - `HexColor` or `ThemeColor`
		 * @example 'FF0000' // hex color (red)
		 * @example pptx.SchemeColor.text1 // Theme color (Text1)
		 */
		color?: Color
		/**
		 * Transparency (percent)
		 * - MS-PPT > Format Shape > Fill & Line > Fill > Transparency
		 * - range: 0-100
		 * @default 0
		 */
		transparency?: number
		/**
		 * Fill type
		 * @default 'solid'
		 */
		type?: 'none' | 'solid'

		/**
		 * Transparency (percent)
		 * @deprecated v3.3.0 - use `transparency`
		 */
		alpha?: number
	}
	export interface ShapeLineProps extends ShapeFillProps {
		/**
		 * Line width (pt)
		 * @default 1
		 */
		width?: number
		/**
		 * Dash type
		 * @default 'solid'
		 */
		dashType?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
		/**
		 * Begin arrow type
		 * @since v3.3.0
		 */
		beginArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
		/**
		 * End arrow type
		 * @since v3.3.0
		 */
		endArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
		// FUTURE: beginArrowSize (1-9)
		// FUTURE: endArrowSize (1-9)

		/**
		 * Dash type
		 * @deprecated v3.3.0 - use `dashType`
		 */
		lineDash?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
		/**
		 * @deprecated v3.3.0 - use `beginArrowType`
		 */
		lineHead?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
		/**
		 * @deprecated v3.3.0 - use `endArrowType`
		 */
		lineTail?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
		/**
		 * Line width (pt)
		 * @deprecated v3.3.0 - use `width`
		 */
		pt?: number
		/**
		 * Line size (pt)
		 * @deprecated v3.3.0 - use `width`
		 */
		size?: number
	}
	// used by: chart, slide, table, text
	export interface TextBaseProps {
		/**
		 * Horizontal alignment
		 * @default 'left'
		 */
		align?: HAlign
		/**
		 * Bold style
		 * @default false
		 */
		bold?: boolean
		/**
		 * Add a line-break
		 * @default false
		 */
		breakLine?: boolean
		/**
		 * Add standard or custom bullet
		 * - use `true` for standard bullet
		 * - pass object options for custom bullet
		 * @default false
		 */
		bullet?:
		| boolean
		| {
			/**
			 * Bullet type
			 * @default bullet
			 */
			type?: 'bullet' | 'number'
			/**
			 * Bullet character code (unicode)
			 * @since v3.3.0
			 * @example '25BA' // 'BLACK RIGHT-POINTING POINTER' (U+25BA)
			 */
			characterCode?: string
			/**
			 * Indentation (space between bullet and text) (points)
			 * @since v3.3.0
			 * @default 27 // DEF_BULLET_MARGIN
			 * @example 10 // Indents text 10 points from bullet
			 */
			indent?: number
			/**
			 * Number type
			 * @since v3.3.0
			 * @example 'romanLcParenR' // roman numerals lower-case with paranthesis right
			 */
			numberType?:
			| 'alphaLcParenBoth'
			| 'alphaLcParenR'
			| 'alphaLcPeriod'
			| 'alphaUcParenBoth'
			| 'alphaUcParenR'
			| 'alphaUcPeriod'
			| 'arabicParenBoth'
			| 'arabicParenR'
			| 'arabicPeriod'
			| 'arabicPlain'
			| 'romanLcParenBoth'
			| 'romanLcParenR'
			| 'romanLcPeriod'
			| 'romanUcParenBoth'
			| 'romanUcParenR'
			| 'romanUcPeriod'
			/**
			 * Number bullets start at
			 * @since v3.3.0
			 * @default 1
			 * @example 10 // numbered bullets start with 10
			 */
			numberStartAt?: number

			// DEPRECATED

			/**
			 * Bullet code (unicode)
			 * @deprecated v3.3.0 - use `characterCode`
			 */
			code?: string
			/**
			 * Margin between bullet and text
			 * @since v3.2.1
			 * @deplrecated v3.3.0 - use `indent`
			 */
			marginPt?: number
			/**
			 * Number to start with (only applies to type:number)
			 * @deprecated v3.3.0 - use `numberStartAt`
			 */
			startAt?: number
			/**
			 * Number type
			 * @deprecated v3.3.0 - use `numberType`
			 */
			style?: string
		}
		/**
		 * Text color
		 * - `HexColor` or `ThemeColor`
		 * - MS-PPT > Format Shape > Text Options > Text Fill & Outline > Text Fill > Color
		 * @example 'FF0000' // hex color (red)
		 * @example pptx.SchemeColor.text1 // Theme color (Text1)
		 */
		color?: Color
		/**
		 * Font face name
		 * @example 'Arial' // Arial font
		 */
		fontFace?: string
		/**
		 * Font size
		 * @example 12 // Font size 12
		 */
		fontSize?: number
		/**
		 * Text highlight color (hex format)
		 * @example 'FFFF00' // yellow
		 */
		highlight?: HexColor
		/**
		 * italic style
		 * @default false
		 */
		italic?: boolean
		/**
		 * language
		 * - ISO 639-1 standard language code
		 * @default 'en-US' // english US
		 * @example 'fr-CA' // french Canadian
		 */
		lang?: string
		/**
		 * Add a soft line-break (shift+enter) before line text content
		 * @default false
		 * @since v3.5.0
		 */
		softBreakBefore?: boolean
		/**
		 * tab stops
		 * - PowerPoint: Paragraph > Tabs > Tab stop position
		 * @example [{ position:1 }, { position:3 }] // Set first tab stop to 1 inch, set second tab stop to 3 inches
		 */
		tabStops?: Array<{ position: number, alignment?: 'l' | 'r' | 'ctr' | 'dec' }>
		/**
		 * text direction
		 * `horz` = horizontal
		 * `vert` = rotate 90^
		 * `vert270` = rotate 270^
		 * `wordArtVert` = stacked
		 * @default 'horz'
		 */
		textDirection?: 'horz' | 'vert' | 'vert270' | 'wordArtVert'
		/**
		 * Transparency (percent)
		 * - MS-PPT > Format Shape > Text Options > Text Fill & Outline > Text Fill > Transparency
		 * - range: 0-100
		 * @default 0
		 */
		transparency?: number
		/**
		 * underline properties
		 * - PowerPoint: Font > Color & Underline > Underline Style/Underline Color
		 * @default (none)
		 */
		underline?: {
			style?:
			| 'dash'
			| 'dashHeavy'
			| 'dashLong'
			| 'dashLongHeavy'
			| 'dbl'
			| 'dotDash'
			| 'dotDashHeave'
			| 'dotDotDash'
			| 'dotDotDashHeavy'
			| 'dotted'
			| 'dottedHeavy'
			| 'heavy'
			| 'none'
			| 'sng'
			| 'wavy'
			| 'wavyDbl'
			| 'wavyHeavy'
			color?: Color
		}
		/**
		 * vertical alignment
		 * @default 'top'
		 */
		valign?: VAlign
	}
	export interface PlaceholderProps extends PositionProps, TextBaseProps {
		name: string
		type: PLACEHOLDER_TYPE
		/**
		 * margin (points)
		 */
		margin?: Margin
	}
	export interface ObjectNameProps {
		/**
		 * Object name
		 * - used instead of default "Object N" name
		 * - PowerPoint: Home > Arrange > Selection Pane...
		 * @since v3.10.0
		 * @default 'Object 1'
		 * @example 'Antenna Design 9'
		 */
		objectName?: string
	}
	export interface ThemeProps {
		/**
		 * Headings font face name
		 * @example 'Arial Narrow'
		 * @default 'Calibri Light'
		 */
		headFontFace?: string
		/**
		 * Body font face name
		 * @example 'Arial'
		 * @default 'Calibri'
		 */
		bodyFontFace?: string
	}

	// image / media ==================================================================================
	export type MediaType = 'audio' | 'online' | 'video'

	export interface ImageProps extends PositionProps, DataOrPathProps, ObjectNameProps {
		/**
		 * Alt Text value ("How would you describe this object and its contents to someone who is blind?")
		 * - PowerPoint: [right-click on an image] > "Edit Alt Text..."
		 */
		altText?: string
		/**
		 * Flip horizontally?
		 * @default false
		 */
		flipH?: boolean
		/**
		 * Flip vertical?
		 * @default false
		 */
		flipV?: boolean
		hyperlink?: HyperlinkProps
		/**
		 * Placeholder type
		 * - values: 'body' | 'header' | 'footer' | 'title' | et. al.
		 * @example 'body'
		 * @see https://docs.microsoft.com/en-us/office/vba/api/powerpoint.ppplaceholdertype
		 */
		placeholder?: string
		/**
		 * Image rotation (degrees)
		 * - range: -360 to 360
		 * @default 0
		 * @example 180 // rotate image 180 degrees
		 */
		rotate?: number
		/**
		 * Enable image rounding
		 * @default false
		 */
		rounding?: boolean
		/**
		 * Shadow Props
		 * - MS-PPT > Format Picture > Shadow
		 * @example
		 * { type: 'outer', color: '000000', opacity: 0.5, blur: 20,  offset: 20, angle: 270 }
		 */
		shadow?: ShadowProps
		/**
		 * Image sizing options
		 */
		sizing?: {
			/**
			 * Sizing type
			 */
			type: 'contain' | 'cover' | 'crop'
			/**
			 * Image width
			 * - inches or percentage
			 * @example 10.25 // position in inches
			 * @example '75%' // position as percentage of slide size
			 */
			w: Coord
			/**
			 * Image height
			 * - inches or percentage
			 * @example 10.25 // position in inches
			 * @example '75%' // position as percentage of slide size
			 */
			h: Coord
			/**
			 * Offset from left to crop image
			 * - `crop` only
			 * - inches or percentage
			 * @example 10.25 // position in inches
			 * @example '75%' // position as percentage of slide size
			 */
			x?: Coord
			/**
			 * Offset from top to crop image
			 * - `crop` only
			 * - inches or percentage
			 * @example 10.25 // position in inches
			 * @example '75%' // position as percentage of slide size
			 */
			y?: Coord
		}
		/**
		 * Transparency (percent)
		 * - MS-PPT > Format Picture > Picture > Picture Transparency > Transparency
		 * - range: 0-100
		 * @default 0
		 * @example 25 // 25% transparent
		 */
		transparency?: number
	}
	/**
	 * Add media (audio/video) to slide
	 * @requires either `link` or `path`
	 */
	export interface MediaProps extends PositionProps, DataOrPathProps, ObjectNameProps {
		/**
		 * Media type
		 * - Use 'online' to embed a YouTube video (only supported in recent versions of PowerPoint)
		 */
		type: MediaType
		/**
		 * Cover image
		 * @since 3.9.0
		 * @default "play button" image, gray background
		 */
		cover?: string
		/**
		 * media file extension
		 * - use when the media file path does not already have an extension, ex: "/folder/SomeSong"
		 * @since 3.9.0
		 * @default extension from file provided
		 */
		extn?: string
		/**
		 * video embed link
		 * - works with YouTube
		 * - other sites may not show correctly in PowerPoint
		 * @example 'https://www.youtube.com/embed/Dph6ynRVyUc' // embed a youtube video
		 */
		link?: string
		/**
		 * full or local path
		 * @example 'https://freesounds/simpsons/bart.mp3' // embed mp3 audio clip from server
		 * @example '/sounds/simpsons_haha.mp3' // embed mp3 audio clip from local directory
		 */
		path?: string
	}

	// formula =========================================================================================

	/**
	 * Add a formula (Office Math / OMML) to slide
	 */
	export interface FormulaProps extends PositionProps, ObjectNameProps {
		/**
		 * OMML XML string representing the formula
		 */
		omml: string
		/**
		 * Font size for the formula (points)
		 */
		fontSize?: number
		/**
		 * Font color (hex)
		 */
		color?: string
		/**
		 * Horizontal alignment: 'left' | 'center' | 'right'
		 * @default 'center'
		 */
		align?: 'left' | 'center' | 'right'
	}

	// shapes =========================================================================================

	export interface ShapeProps extends PositionProps, ObjectNameProps {
		/**
		 * Horizontal alignment
		 * @default 'left'
		 */
		align?: HAlign
		/**
		 * Radius (only for pptx.shapes.PIE, pptx.shapes.ARC, pptx.shapes.BLOCK_ARC)
		 * - In the case of pptx.shapes.BLOCK_ARC you have to setup the arcThicknessRatio
		 * - values: [0-359, 0-359]
		 * @since v3.4.0
		 * @default [270, 0]
		 */
		angleRange?: [number, number]
		/**
		 * Radius (only for pptx.shapes.BLOCK_ARC)
		 * - You have to setup the angleRange values too
		 * - values: 0.0-1.0
		 * @since v3.4.0
		 * @default 0.5
		 */
		arcThicknessRatio?: number
		/**
		 * Shape fill color properties
		 * @example { color:'FF0000' } // hex color (red)
		 * @example { color:'0088CC', transparency:50 } // hex color, 50% transparent
		 * @example { color:pptx.SchemeColor.accent1 } // Theme color Accent1
		 */
		fill?: ShapeFillProps
		/**
		 * Flip shape horizontally?
		 * @default false
		 */
		flipH?: boolean
		/**
		 * Flip shape vertical?
		 * @default false
		 */
		flipV?: boolean
		/**
		 * Add hyperlink to shape
		 * @example hyperlink: { url: "https://github.com/gitbrent/pptxgenjs", tooltip: "Visit Homepage" },
		 */
		hyperlink?: HyperlinkProps
		/**
		 * Line options
		 */
		line?: ShapeLineProps
		/**
		 * Points (only for pptx.shapes.CUSTOM_GEOMETRY)
		 * - type: 'arc'
		 * - `hR` Shape Arc Height Radius
		 * - `wR` Shape Arc Width Radius
		 * - `stAng` Shape Arc Start Angle
		 * - `swAng` Shape Arc Swing Angle
		 * @see http://www.datypic.com/sc/ooxml/e-a_arcTo-1.html
		 * @example [{ x: 0, y: 0 }, { x: 10, y: 10 }] // draw a line between those two points
		 */
		points?: Array<
			| { x: Coord, y: Coord, moveTo?: boolean }
			| { x: Coord, y: Coord, curve: { type: 'arc', hR: Coord, wR: Coord, stAng: number, swAng: number } }
			| { x: Coord, y: Coord, curve: { type: 'cubic', x1: Coord, y1: Coord, x2: Coord, y2: Coord } }
			| { x: Coord, y: Coord, curve: { type: 'quadratic', x1: Coord, y1: Coord } }
			| { close: true }
		>
		/**
		 * Rounded rectangle radius (only for pptx.shapes.ROUNDED_RECTANGLE)
		 * - values: 0.0 to 1.0
		 * @default 0
		 */
		rectRadius?: number
		/**
		 * Rotation (degrees)
		 * - range: -360 to 360
		 * @default 0
		 * @example 180 // rotate 180 degrees
		 */
		rotate?: number
		/**
		 * Shadow options
		 * TODO: need new demo.js entry for shape shadow
		 */
		shadow?: ShadowProps

		/**
		 * @deprecated v3.3.0
		 */
		lineSize?: number
		/**
		 * @deprecated v3.3.0
		 */
		lineDash?: 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'solid' | 'sysDash' | 'sysDot'
		/**
		 * @deprecated v3.3.0
		 */
		lineHead?: 'arrow' | 'diamond' | 'none' | 'oval' | 'stealth' | 'triangle'
		/**
		 * @deprecated v3.3.0
		 */
		lineTail?: 'arrow' | 'diamond' | 'none' | 'oval' | 'stealth' | 'triangle'
		/**
		 * Shape name (used instead of default "Shape N" name)
		 * @deprecated v3.10.0 - use `objectName`
		 */
		shapeName?: string
	}

	// tables =========================================================================================

	export interface TableToSlidesProps extends TableProps {
		//_arrObjTabHeadRows?: TableRow[]
		// _masterSlide?: SlideLayout

		/**
		 * Add an image to slide(s) created during autopaging
		 * - `image` prop requires either `path` or `data`
		 * - see `DataOrPathProps` for details on `image` props
		 * - see `PositionProps` for details on `options` props
		 */
		addImage?: { image: DataOrPathProps, options: PositionProps }
		/**
		 * Add a shape to slide(s) created during autopaging
		 */
		addShape?: { shapeName: SHAPE_NAME, options: ShapeProps }
		/**
		 * Add a table to slide(s) created during autopaging
		 */
		addTable?: { rows: TableRow[], options: TableProps }
		/**
		 * Add a text object to slide(s) created during autopaging
		 */
		addText?: { text: TextProps[], options: TextPropsOptions }
		/**
		 * Whether to enable auto-paging
		 * - auto-paging creates new slides as content overflows a slide
		 * @default true
		 */
		autoPage?: boolean
		/**
		 * Auto-paging character weight
		 * - adjusts how many characters are used before lines wrap
		 * - range: -1.0 to 1.0
		 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
		 * @default 0.0
		 * @example 0.5 // lines are longer (increases the number of characters that can fit on a given line)
		 */
		autoPageCharWeight?: number
		/**
		 * Auto-paging line weight
		 * - adjusts how many lines are used before slides wrap
		 * - range: -1.0 to 1.0
		 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
		 * @default 0.0
		 * @example 0.5 // tables are taller (increases the number of lines that can fit on a given slide)
		 */
		autoPageLineWeight?: number
		/**
		 * Whether to repeat head row(s) on new tables created by autopaging
		 * @since v3.3.0
		 * @default false
		 */
		autoPageRepeatHeader?: boolean
		/**
		 * The `y` location to use on subsequent slides created by autopaging
		 * @default (top margin of Slide)
		 */
		autoPageSlideStartY?: number
		/**
		 * Column widths (inches)
		 */
		colW?: number | number[]
		/**
		 * Master slide name
		 * - define a master slide to have your auto-paged slides have corporate design, etc.
		 * @see https://gitbrent.github.io/PptxGenJS/docs/masters.html
		 */
		masterSlideName?: string
		/**
		 * Slide margin
		 * - this margin will be across all slides created by auto-paging
		 */
		slideMargin?: Margin

		/**
		 * @deprecated v3.3.0 - use `autoPageRepeatHeader`
		 */
		addHeaderToEach?: boolean
		/**
		 * @deprecated v3.3.0 - use `autoPageSlideStartY`
		 */
		newSlideStartY?: number
	}
	export interface TableCellProps extends TextBaseProps {
		/**
		 * Auto-paging character weight
		 * - adjusts how many characters are used before lines wrap
		 * - range: -1.0 to 1.0
		 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
		 * @default 0.0
		 * @example 0.5 // lines are longer (increases the number of characters that can fit on a given line)
		 */
		autoPageCharWeight?: number
		/**
		 * Auto-paging line weight
		 * - adjusts how many lines are used before slides wrap
		 * - range: -1.0 to 1.0
		 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
		 * @default 0.0
		 * @example 0.5 // tables are taller (increases the number of lines that can fit on a given slide)
		 */
		autoPageLineWeight?: number
		/**
		 * Cell border
		 */
		border?: BorderProps | [BorderProps, BorderProps, BorderProps, BorderProps]
		/**
		 * Cell colspan
		 */
		colspan?: number
		/**
		 * Fill color
		 * @example { color:'FF0000' } // hex color (red)
		 * @example { color:'0088CC', transparency:50 } // hex color, 50% transparent
		 * @example { color:pptx.SchemeColor.accent1 } // theme color Accent1
		 */
		fill?: ShapeFillProps
		hyperlink?: HyperlinkProps
		/**
		 * Cell margin (inches)
		 * @default 0
		 */
		margin?: Margin
		/**
		 * Cell rowspan
		 */
		rowspan?: number
	}
	export interface TableProps extends PositionProps, TextBaseProps, ObjectNameProps {
		//_arrObjTabHeadRows?: TableRow[]

		/**
		 * Whether to enable auto-paging
		 * - auto-paging creates new slides as content overflows a slide
		 * @default false
		 */
		autoPage?: boolean
		/**
		 * Auto-paging character weight
		 * - adjusts how many characters are used before lines wrap
		 * - range: -1.0 to 1.0
		 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
		 * @default 0.0
		 * @example 0.5 // lines are longer (increases the number of characters that can fit on a given line)
		 */
		autoPageCharWeight?: number
		/**
		 * Auto-paging line weight
		 * - adjusts how many lines are used before slides wrap
		 * - range: -1.0 to 1.0
		 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
		 * @default 0.0
		 * @example 0.5 // tables are taller (increases the number of lines that can fit on a given slide)
		 */
		autoPageLineWeight?: number
		/**
		 * Whether table header row(s) should be repeated on each new slide creating by autoPage.
		 * Use `autoPageHeaderRows` to designate how many rows comprise the table header (1+).
		 * @default false
		 * @since v3.3.0
		 */
		autoPageRepeatHeader?: boolean
		/**
		 * Number of rows that comprise table headers
		 * - required when `autoPageRepeatHeader` is set to true.
		 * @example 2 - repeats the first two table rows on each new slide created
		 * @default 1
		 * @since v3.3.0
		 */
		autoPageHeaderRows?: number
		/**
		 * The `y` location to use on subsequent slides created by autopaging
		 * @default (top margin of Slide)
		 */
		autoPageSlideStartY?: number
		/**
		 * Table border
		 * - single value is applied to all 4 sides
		 * - array of values in TRBL order for individual sides
		 */
		border?: BorderProps | [BorderProps, BorderProps, BorderProps, BorderProps]
		/**
		 * Width of table columns (inches)
		 * - single value is applied to every column equally based upon `w`
		 * - array of values in applied to each column in order
		 * @default columns of equal width based upon `w`
		 */
		colW?: number | number[]
		/**
		 * Cell background color
		 * @example { color:'FF0000' } // hex color (red)
		 * @example { color:'0088CC', transparency:50 } // hex color, 50% transparent
		 * @example { color:pptx.SchemeColor.accent1 } // theme color Accent1
		 */
		fill?: ShapeFillProps
		/**
		 * Cell margin (inches)
		 * - affects all table cells, is superceded by cell options
		 */
		margin?: Margin
		/**
		 * Height of table rows (inches)
		 * - single value is applied to every row equally based upon `h`
		 * - array of values in applied to each row in order
		 * @default rows of equal height based upon `h`
		 */
		rowH?: number | number[]
		/**
		 * DEV TOOL: Verbose Mode (to console)
		 * - tell the library to provide an almost ridiculous amount of detail during auto-paging calculations
		 * @default false // obviously
		 */
		verbose?: boolean // Undocumented; shows verbose output

		/**
		 * @deprecated v3.3.0 - use `autoPageSlideStartY`
		 */
		newSlideStartY?: number
	}
	export interface TableCell {
		text?: string | TableCell[]
		options?: TableCellProps
	}
	export interface TableRowSlide {
		rows: TableRow[]
	}
	export type TableRow = TableCell[]

	// text ===========================================================================================
	export interface TextGlowProps {
		/**
		 * Border color (hex format)
		 * @example 'FF3399'
		 */
		color?: HexColor
		/**
		 * opacity (0.0 - 1.0)
		 * @example 0.5
		 * 50% opaque
		 */
		opacity: number
		/**
		 * size (points)
		 */
		size: number
	}

	export interface TextPropsOptions extends PositionProps, DataOrPathProps, TextBaseProps, ObjectNameProps {
		baseline?: number
		/**
		 * Character spacing
		 */
		charSpacing?: number
		/**
		 * Text fit options
		 *
		 * MS-PPT > Format Shape > Shape Options > Text Box > "[unlabeled group]": [3 options below]
		 * - 'none' = Do not Autofit
		 * - 'shrink' = Shrink text on overflow
		 * - 'resize' = Resize shape to fit text
		 *
		 * **Note** 'shrink' and 'resize' only take effect after editing text/resize shape.
		 * Both PowerPoint and Word dynamically calculate a scaling factor and apply it when edit/resize occurs.
		 *
		 * There is no way for this library to trigger that behavior, sorry.
		 * @since v3.3.0
		 * @default "none"
		 */
		fit?: 'none' | 'shrink' | 'resize'
		/**
		 * Shape fill
		 * @example { color:'FF0000' } // hex color (red)
		 * @example { color:'0088CC', transparency:50 } // hex color, 50% transparent
		 * @example { color:pptx.SchemeColor.accent1 } // theme color Accent1
		 */
		fill?: ShapeFillProps
		/**
		 * Flip shape horizontally?
		 * @default false
		 */
		flipH?: boolean
		/**
		 * Flip shape vertical?
		 * @default false
		 */
		flipV?: boolean
		glow?: TextGlowProps
		hyperlink?: HyperlinkProps
		indentLevel?: number
		isTextBox?: boolean
		line?: ShapeLineProps
		/**
		 * Line spacing (pt)
		 * - PowerPoint: Paragraph > Indents and Spacing > Line Spacing: > "Exactly"
		 * @example 28 // 28pt
		 */
		lineSpacing?: number
		/**
		 * line spacing multiple (percent)
		 * - range: 0.0-9.99
		 * - PowerPoint: Paragraph > Indents and Spacing > Line Spacing: > "Multiple"
		 * @example 1.5 // 1.5X line spacing
		 * @since v3.5.0
		 */
		lineSpacingMultiple?: number
		// TODO: [20220219] powerpoint uses inches but library has always been pt... @future @deprecated - update in v4.0? [range: 0.0-22.0]
		/**
		 * Margin (points)
		 * - PowerPoint: Format Shape > Shape Options > Size & Properties > Text Box > Left/Right/Top/Bottom margin
		 * @default "Normal" margin in PowerPoint [3.5, 7.0, 3.5, 7.0] // (this library sets no value, but PowerPoint defaults to "Normal" [0.05", 0.1", 0.05", 0.1"])
		 * @example 0 // Top/Right/Bottom/Left margin 0 [0.0" in powerpoint]
		 * @example 10 // Top/Right/Bottom/Left margin 10 [0.14" in powerpoint]
		 * @example [10,5,10,5] // Top margin 10, Right margin 5, Bottom margin 10, Left margin 5
		 */
		margin?: Margin
		outline?: { color: Color, size: number }
		paraSpaceAfter?: number
		paraSpaceBefore?: number
		placeholder?: string
		/**
		 * Rounded rectangle radius (only for pptx.shapes.ROUNDED_RECTANGLE)
		 * - values: 0.0 to 1.0
		 * @default 0
		 */
		rectRadius?: number
		/**
		 * Rotation (degrees)
		 * - range: -360 to 360
		 * @default 0
		 * @example 180 // rotate 180 degrees
		 */
		rotate?: number
		/**
		 * Whether to enable right-to-left mode
		 * @default false
		 */
		rtlMode?: boolean
		shadow?: ShadowProps
		shape?: SHAPE_NAME
		strike?: boolean | 'dblStrike' | 'sngStrike'
		subscript?: boolean
		superscript?: boolean
		/**
		 * Vertical alignment
		 * @default middle
		 */
		valign?: VAlign
		vert?: 'eaVert' | 'horz' | 'mongolianVert' | 'vert' | 'vert270' | 'wordArtVert' | 'wordArtVertRtl'
		/**
		 * Text wrap
		 * @since v3.3.0
		 * @default true
		 */
		wrap?: boolean

		/**
		 * Whether "Fit to Shape?" is enabled
		 * @deprecated v3.3.0 - use `fit`
		 */
		autoFit?: boolean
		/**
		 * Whather "Shrink Text on Overflow?" is enabled
		 * @deprecated v3.3.0 - use `fit`
		 */
		shrinkText?: boolean
		/**
		 * Inset
		 * @deprecated v3.10.0 - use `margin`
		 */
		inset?: number
		/**
		 * Dash type
		 * @deprecated v3.3.0 - use `line.dashType`
		 */
		lineDash?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
		/**
		 * @deprecated v3.3.0 - use `line.beginArrowType`
		 */
		lineHead?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
		/**
		 * @deprecated v3.3.0 - use `line.width`
		 */
		lineSize?: number
		/**
		 * @deprecated v3.3.0 - use `line.endArrowType`
		 */
		lineTail?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	}
	export interface TextProps {
		text?: string
		options?: TextPropsOptions
	}

	// charts =========================================================================================
	// Split out to keep this declaration entrypoint below the project line budget.
	export type ChartAxisTickMark = ChartTypes.ChartAxisTickMark
	export type ChartLineCap = ChartTypes.ChartLineCap
	export type OptsChartData = ChartTypes.OptsChartData
	export type OptsChartGridLine = ChartTypes.OptsChartGridLine
	export type IChartMulti = ChartTypes.IChartMulti
	export type IChartPropsFillLine = ChartTypes.IChartPropsFillLine
	export type IChartAreaProps = ChartTypes.IChartAreaProps
	export type IChartPropsBase = ChartTypes.IChartPropsBase
	export type IChartPropsAxisCat = ChartTypes.IChartPropsAxisCat
	export type IChartPropsAxisSer = ChartTypes.IChartPropsAxisSer
	export type IChartPropsAxisVal = ChartTypes.IChartPropsAxisVal
	export type IChartPropsChartBar = ChartTypes.IChartPropsChartBar
	export type IChartPropsChartDoughnut = ChartTypes.IChartPropsChartDoughnut
	export type IChartPropsChartLine = ChartTypes.IChartPropsChartLine
	export type IChartPropsChartPie = ChartTypes.IChartPropsChartPie
	export type IChartPropsChartRadar = ChartTypes.IChartPropsChartRadar
	export type IChartPropsDataLabel = ChartTypes.IChartPropsDataLabel
	export type IChartPropsDataTable = ChartTypes.IChartPropsDataTable
	export type IChartPropsLegend = ChartTypes.IChartPropsLegend
	export type IChartPropsTitle = ChartTypes.IChartPropsTitle
	export type IChartOpts = ChartTypes.IChartOpts
	export type ISlideRelChart = ChartTypes.ISlideRelChart
	// Core
	// Core
	// ====
	export interface WriteBaseProps {
		/**
		 * Whether to compress export (can save substantial space, but takes a bit longer to export)
		 * @default false
		 * @since v3.5.0
		 */
		compression?: boolean
	}
	export interface WriteProps extends WriteBaseProps {
		/**
		 * Output type
		 * - values: 'arraybuffer' | 'base64' | 'binarystring' | 'blob' | 'nodebuffer' | 'uint8array' | 'STREAM'
		 * @default 'blob'
		 */
		outputType?: WRITE_OUTPUT_TYPE
	}
	export interface WriteFileProps extends WriteBaseProps {
		/**
		 * Export file name
		 * @default 'Presentation.pptx'
		 */
		fileName?: string
	}
	export interface SectionProps {
		//_type: 'user' | 'default'
		//_slides: PresSlide[]

		/**
		 * Section title
		 */
		title: string
		/**
		 * Section order - uses to add section at any index
		 * - values: 1-n
		 */
		order?: number
	}
	export interface PresLayout {
		//_sizeW?: number
		//_sizeH?: number

		/**
		 * Layout Name
		 * @example 'LAYOUT_WIDE'
		 */
		name: string
		width: number
		height: number
	}
	export interface SlideNumberProps extends PositionProps, TextBaseProps {
		/**
		 * margin (points)
		 */
		margin?: Margin // TODO: convert to inches in 4.0 (valid values are 0-22)
	}
	export interface SlideMasterProps {
		/**
		 * Unique name for this master
		 */
		title: string
		background?: BackgroundProps
		margin?: Margin
		slideNumber?: SlideNumberProps
		objects?: Array<| { chart: IChartOpts }
			| { image: ImageProps }
			| { line: ShapeProps }
			| { rect: ShapeProps }
			| { text: TextProps }
			| {
				placeholder: {
					options: PlaceholderProps
					/**
					 * Text to be shown in placeholder (shown until user focuses textbox or adds text)
					 * - Leave blank to have powerpoint show default phrase (ex: "Click to add title")
					 */
					text?: string
				}
			}>

		/**
		 * @deprecated v3.3.0 - use `background`
		 */
		bkgd?: string | BackgroundProps
	}
	export interface ObjectOptions extends ImageProps, PositionProps, ShapeProps, TableCellProps, TextPropsOptions {
		//_placeholderIdx?: number
		//_placeholderType?: PLACEHOLDER_TYPE

		cx?: Coord
		cy?: Coord
		margin?: Margin
		colW?: number | number[] // table
		rowH?: number | number[] // table
	}
	export interface PresSlide {
		addChart: Function
		addFormula: Function
		addImage: Function
		addMedia: Function
		addNotes: Function
		addShape: Function
		addTable: Function
		addText: Function

		/**
		 * Background color or image (`color` | `path` | `data`)
		 * @example { color: 'FF3399' } - hex color
		 * @example { color: 'FF3399', transparency:50 } - hex color with 50% transparency
		 * @example { path: 'https://onedrives.com/myimg.png` } - retrieve image via URL
		 * @example { path: '/home/gitbrent/images/myimg.png` } - retrieve image via local path
		 * @example { data: 'image/png;base64,iVtDaDrF[...]=' } - base64 string
		 * @since v3.3.0
		 */
		background?: BackgroundProps
		/**
		 * Default text color (hex format)
		 * @example 'FF3399'
		 * @default '000000' (DEF_FONT_COLOR)
		 */
		color?: HexColor
		/**
		 * Whether slide is hidden
		 * @default false
		 */
		hidden?: boolean
		/**
		 * Slide number options
		 */
		slideNumber?: SlideNumberProps
	}
	export interface AddSlideProps {
		masterName?: string // TODO: 20200528: rename to "masterTitle" (createMaster uses `title` so lets be consistent)
		sectionTitle?: string
	}
	export interface PresentationProps {
		author: string
		company: string
		layout: string
		masterSlide: PresSlide
		/**
		 * Presentation's layout
		 * read-only
		 */
		presLayout: PresLayout
		revision: string
		/**
		 * Whether to enable right-to-left mode
		 * @default false
		 */
		rtlMode: boolean
		subject: string
		theme: ThemeProps
		title: string
	}

	// LAST: Slide
	/**
	 * `slide.d.ts`
	 */
	export class Slide {
		/**
		 * Background color or image (`color` | `path` | `data`)
		 * @example { color: 'FF3399' } - hex color
		 * @example { color: 'FF3399', transparency:50 } - hex color with 50% transparency
		 * @example { path: 'https://onedrives.com/myimg.png` } - retrieve image via URL
		 * @example { path: '/home/gitbrent/images/myimg.png` } - retrieve image via local path
		 * @example { data: 'image/png;base64,iVtDaDrF[...]=' } - base64 string
		 * @since 3.3.0
		 */
		background: BackgroundProps
		/**
		 * Default text color (hex format)
		 * @example 'FF3399'
		 * @default '000000' (DEF_FONT_COLOR)
		 */
		color: HexColor
		/**
		 * Whether slide is hidden
		 * @default false
		 */
		hidden: boolean
		/**
		 * Slide number options
		 */
		slideNumber: SlideNumberProps
		/**
		 * New slides added by an auto paged table
		 */
		newAutoPagedSlides: PresSlide[]
		/**
		 * Add chart to Slide
		 * @param {CHART_NAME|IChartMulti[]} type - chart type
		 * @param {object[]} data - data object
		 * @param {IChartOpts} options - chart options
		 * @return {Slide} this Slide
		 * @type {Function}
		 */
		addChart(type: CHART_NAME | IChartMulti[], data: any[], options?: IChartOpts): Slide
		/**
		 * Add formula (Office Math / OMML) to Slide
		 * @param {FormulaProps} options - formula options
		 * @return {Slide} this Slide
		 */
		addFormula(options: FormulaProps): Slide
		/**
		 * Add image to Slide
		 * @param {ImageProps} options - image options
		 * @return {Slide} this Slide
		 */
		addImage(options: ImageProps): Slide
		/**
		 * Add media (audio/video) to Slide
		 * @param {MediaProps} options - media options
		 * @return {Slide} this Slide
		 */
		addMedia(options: MediaProps): Slide
		/**
		 * Add speaker notes to Slide
		 * @docs https://gitbrent.github.io/PptxGenJS/docs/speaker-notes.html
		 * @param {string} notes - notes to add to slide
		 * @return {Slide} this Slide
		 */
		addNotes(notes: string): Slide
		/**
		 * Add shape to Slide
		 * @param {SHAPE_NAME} shapeName - shape name
		 * @param {ShapeProps} options - shape options
		 * @return {Slide} this Slide
		 */
		addShape(shapeName: SHAPE_NAME, options?: ShapeProps): Slide
		/**
		 * Add table to Slide
		 * @param {TableRow[]} tableRows - table rows
		 * @param {TableProps} options - table options
		 * @return {Slide} this Slide
		 */
		addTable(tableRows: TableRow[], options?: TableProps): Slide
		/**
		 * Add text to Slide
		 * @param {string|TextProps[]} text - text string or complex object
		 * @param {TextPropsOptions} options - text options
		 * @return {Slide} this Slide
		 */
		addText(text: string | TextProps[], options?: TextPropsOptions): Slide

		/**
		 * Background color
		 * @deprecated in 3.3.0 - use `background` instead
		 */
		bkgd: string
	}
}
