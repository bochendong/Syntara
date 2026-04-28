import temml from 'temml';
import { mml2omml } from 'mathml2omml';
import { createLogger } from '@/lib/logger';
import { normalizeMathSource } from './index';

const log = createLogger('MathEngineOmml');

function stripUnsupportedMathML(mathml: string): string {
  const unsupported = ['mpadded'];
  let result = mathml;
  for (const tag of unsupported) {
    result = result.replace(new RegExp(`<${tag}[^>]*>`, 'g'), '');
    result = result.replace(new RegExp(`</${tag}>`, 'g'), '');
  }
  return result;
}

function buildMathRPr(szHundredths?: number): string {
  const szAttr = szHundredths ? ` sz="${szHundredths}"` : '';
  return (
    `<a:rPr lang="en-US" i="1"${szAttr}>` +
    '<a:latin typeface="Cambria Math" panose="02040503050406030204" charset="0"/>' +
    '<a:cs typeface="Cambria Math" panose="02040503050406030204" charset="0"/>' +
    '</a:rPr>'
  );
}

function postProcessOmml(omml: string, szHundredths?: number): string {
  let result = omml;
  const rpr = buildMathRPr(szHundredths);

  result = result.replace(/ xmlns:w="[^"]*"/g, '');
  result = result.replace(/ xmlns:m="[^"]*"/g, '');
  result = result.replace(/<m:r>(\s*)<m:t/g, `<m:r>$1${rpr}$1<m:t`);
  result = result.replace(/<m:ctrlPr\/>/g, `<m:ctrlPr>${rpr}</m:ctrlPr>`);
  result = result.replace(/<m:ctrlPr><\/m:ctrlPr>/g, `<m:ctrlPr>${rpr}</m:ctrlPr>`);

  return result;
}

export function renderMathToOmml(latexSource: string, fontSize?: number): string | null {
  const latex = normalizeMathSource(latexSource);
  try {
    const mathml = temml.renderToString(latex);
    const cleaned = stripUnsupportedMathML(mathml);
    const omml = String(mml2omml(cleaned));
    const szHundredths = fontSize ? Math.round(fontSize * 100) : undefined;
    return postProcessOmml(omml, szHundredths);
  } catch {
    log.warn(`Failed to convert: "${latex}"`);
    return null;
  }
}
