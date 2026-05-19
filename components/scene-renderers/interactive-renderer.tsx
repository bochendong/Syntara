'use client';

import { useMemo } from 'react';
import type { InteractiveContent } from '@/lib/types/stage';

interface InteractiveRendererProps {
  readonly content: InteractiveContent;
  readonly mode: 'autonomous' | 'playback';
  readonly sceneId: string;
}

export function InteractiveRenderer({ content, mode: _mode, sceneId }: InteractiveRendererProps) {
  const patchedHtml = useMemo(
    () => (content.html ? patchHtmlForIframe(content.html) : undefined),
    [content.html],
  );

  return (
    <div className="w-full h-full relative">
      <iframe
        srcDoc={patchedHtml}
        src={patchedHtml ? undefined : content.url}
        className="absolute inset-0 w-full h-full border-0"
        title={`Interactive Scene ${sceneId}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}

/**
 * Patch embedded HTML to display correctly inside an iframe.
 *
 * Fixes:
 * - min-h-screen / h-screen → use 100% of iframe viewport
 * - Ensure html/body fill the iframe with no overflow issues
 * - Canvas elements use container sizing instead of viewport
 */
function patchHtmlForIframe(html: string): string {
  const iframeCss = `<style data-iframe-patch>
  html, body {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
  /* Fix min-h-screen: in iframes 100vh is the iframe height, which is correct,
     but ensure body actually fills it */
  body { min-height: 100vh !important; }
  #__synatra-html-ppt-viewport {
    width: 100vw;
    height: 100vh;
    min-height: 100vh;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    background: transparent;
  }
  #__synatra-html-ppt-stage {
    position: relative;
    flex: 0 0 auto;
  }
  body.__synatra-html-ppt-fitted {
    display: block !important;
  }
</style>`;
  const iframeScript = `<script data-iframe-patch>
(function () {
  function numericPx(value) {
    var parsed = parseFloat(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fitHtmlPptSlide() {
    var slide = document.querySelector("section.slide, .slide");
    if (!(slide instanceof HTMLElement)) return;

    var existingStage = document.getElementById("__synatra-html-ppt-stage");
    var viewport = document.getElementById("__synatra-html-ppt-viewport");
    var stage = existingStage;

    if (!stage || !viewport) {
      var rect = slide.getBoundingClientRect();
      var style = window.getComputedStyle(slide);
      var initialWidth = Math.max(numericPx(style.width), slide.scrollWidth, rect.width);
      var initialHeight = Math.max(numericPx(style.height), slide.scrollHeight, rect.height);
      if (initialWidth < 900 || initialHeight < 500) return;

      viewport = document.createElement("div");
      viewport.id = "__synatra-html-ppt-viewport";
      stage = document.createElement("div");
      stage.id = "__synatra-html-ppt-stage";
      var parent = slide.parentElement || document.body;
      parent.insertBefore(viewport, slide);
      stage.appendChild(slide);
      viewport.appendChild(stage);
      document.body.classList.add("__synatra-html-ppt-fitted");
    }

    function resize() {
      if (!stage || !viewport) return;
      var style = window.getComputedStyle(slide);
      var rect = slide.getBoundingClientRect();
      var baseWidth = Math.max(numericPx(style.width), slide.scrollWidth, rect.width, 1600);
      var baseHeight = Math.max(numericPx(style.height), slide.scrollHeight, rect.height, 900);
      var expandedPage = baseHeight > 1000;
      var scaleX = window.innerWidth / baseWidth;
      var scaleY = window.innerHeight / baseHeight;
      var scale = Math.min(scaleX, expandedPage ? scaleX : scaleY, 1);
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;

      slide.style.transform = "scale(" + scale + ")";
      slide.style.transformOrigin = "top left";
      slide.style.position = "absolute";
      slide.style.left = "0";
      slide.style.top = "0";
      slide.style.margin = "0";
      stage.style.width = baseWidth * scale + "px";
      stage.style.height = baseHeight * scale + "px";
      viewport.style.overflowY = expandedPage ? "auto" : "hidden";
      viewport.style.alignItems =
        !expandedPage && baseHeight * scale < window.innerHeight ? "center" : "flex-start";
    }

    resize();
    window.addEventListener("resize", resize);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(resize).catch(function () {});
    }
    setTimeout(resize, 60);
    setTimeout(resize, 240);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fitHtmlPptSlide, { once: true });
  } else {
    fitHtmlPptSlide();
  }
})();
</script>`;

  const withCss = (() => {
    // Insert right after <head> or at the start of the document
    const headIdx = html.indexOf('<head>');
    if (headIdx !== -1) {
      const insertPos = headIdx + 6; // after <head>
      return html.substring(0, insertPos) + '\n' + iframeCss + html.substring(insertPos);
    }

    const headWithAttrs = html.indexOf('<head ');
    if (headWithAttrs !== -1) {
      const closeAngle = html.indexOf('>', headWithAttrs);
      if (closeAngle !== -1) {
        const insertPos = closeAngle + 1;
        return html.substring(0, insertPos) + '\n' + iframeCss + html.substring(insertPos);
      }
    }

    return iframeCss + html;
  })();

  const bodyClose = withCss.toLowerCase().lastIndexOf('</body>');
  if (bodyClose !== -1) {
    return withCss.substring(0, bodyClose) + iframeScript + withCss.substring(bodyClose);
  }

  return withCss + iframeScript;
}
