import { DEF_CHART_GRIDLINE } from './core-enums'
import type { ChartLineCap, OptsChartGridLine, ShadowProps } from './core-interfaces'
import { valToPts } from './gen-utils'

/**
 * Creates `a:innerShdw` or `a:outerShdw` depending on pass options `opts`.
 * @param {Object} opts optional shadow properties
 * @param {Object} defaults defaults for unspecified properties in `opts`
 * @see http://officeopenxml.com/drwSp-effects.php
 * @example { type: 'outer', blur: 3, offset: (23000 / 12700), angle: 90, color: '000000', opacity: 0.35, rotateWithShape: true };
 * @return {string} XML
 */
export function createShadowElement (options: ShadowProps, defaults: object): string {
	if (!options) {
		return '<a:effectLst/>'
	} else if (typeof options !== 'object') {
		console.warn('`shadow` options must be an object. Ex: `{shadow: {type:\'none\'}}`')
		return '<a:effectLst/>'
	}

	let strXml = '<a:effectLst>'
	const opts = { ...defaults, ...options }
	const type = opts.type || 'outer'
	const blur = valToPts(opts.blur)
	const offset = valToPts(opts.offset)
	const angle = Math.round(opts.angle * 60000)
	const color = opts.color
	const opacity = Math.round(opts.opacity * 100000)
	const rotShape = opts.rotateWithShape ? 1 : 0

	strXml += `<a:${type}Shdw sx="100000" sy="100000" kx="0" ky="0"  algn="bl" blurRad="${blur}" rotWithShape="${rotShape}" dist="${offset}" dir="${angle}">`
	strXml += `<a:srgbClr val="${color}">`
	strXml += `<a:alpha val="${opacity}"/></a:srgbClr>`
	strXml += `</a:${type}Shdw>`
	strXml += '</a:effectLst>'

	return strXml
}

/**
 * Create Grid Line Element
 * @param {OptsChartGridLine} glOpts {size, color, style}
 * @return {string} XML
 */
export function createGridLineElement (glOpts: OptsChartGridLine): string {
	let strXml = '<c:majorGridlines>'
	strXml += ' <c:spPr>'
	strXml += `  <a:ln w="${valToPts(glOpts.size || DEF_CHART_GRIDLINE.size)}" cap="${createLineCap(glOpts.cap || DEF_CHART_GRIDLINE.cap)}">`
	strXml += '  <a:solidFill><a:srgbClr val="' + (glOpts.color || DEF_CHART_GRIDLINE.color) + '"/></a:solidFill>' // should accept scheme colors as implemented in [Pull #135]
	strXml += '   <a:prstDash val="' + (glOpts.style || DEF_CHART_GRIDLINE.style) + '"/><a:round/>'
	strXml += '  </a:ln>'
	strXml += ' </c:spPr>'
	strXml += '</c:majorGridlines>'

	return strXml
}

export function createLineCap (lineCap: ChartLineCap): string {
	if (!lineCap || lineCap === 'flat') {
		return 'flat'
	} else if (lineCap === 'square') {
		return 'sq'
	} else if (lineCap === 'round') {
		return 'rnd'
	} else {
		const neverLineCap: never = lineCap
		throw new Error(`Invalid chart line cap: ${neverLineCap}`)
	}
}
