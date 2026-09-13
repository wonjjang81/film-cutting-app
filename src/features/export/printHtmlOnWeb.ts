type PrintDocument = Pick<Document, 'body' | 'createElement'>;

/** Prints generated HTML on web instead of expo-print's current-page fallback. */
export function printHtmlOnWeb(html: string, documentRef: PrintDocument = document): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = documentRef.createElement('iframe');
    frame.setAttribute('title', '배치 미리보기 PDF 출력');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.style.opacity = '0';
    const timeout = setTimeout(() => {
      frame.remove();
      reject(new Error('PDF 출력 화면을 준비하지 못했습니다.'));
    }, 8_000);
    frame.onload = () => {
      clearTimeout(timeout);
      try {
        if (!frame.contentWindow) throw new Error('PDF 출력 창을 열 수 없습니다.');
        frame.contentWindow.focus();
        frame.contentWindow.print();
        frame.remove();
        resolve();
      } catch (error) {
        frame.remove();
        reject(error);
      }
    };
    frame.srcdoc = html;
    documentRef.body.appendChild(frame);
  });
}
