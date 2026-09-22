/**
 * JOB RUSH — CV/document viewer.
 * VIEW and DOWNLOAD are two different actions with two different
 * URLs (see cvService.getOwn/getForViewer -- signedUrl has no
 * Content-Disposition override so the browser renders it inline;
 * downloadUrl is signed with Supabase Storage's `download` option,
 * which forces Content-Disposition: attachment with the real
 * filename). This module only ever opens signedUrl for viewing —
 * clicking View must never trigger a download.
 *
 * PDFs and images get a real embedded preview. DOC/DOCX cannot be
 * safely previewed in-browser without either a heavyweight
 * conversion pipeleine or uploading the user's document to a
 * third-party viewer service — both out of scope/unsafe — so those
 * honestly show a "download to view" message instead of pretending
 * to preview something that isn't actually previewed.
 */
const CvViewer = (function () {
  const PDF_MIME = 'application/pdf';
  const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  function open({ mimeType, viewUrl, downloadUrl, fileName }) {
    const isPdf = mimeType === PDF_MIME;
    const isImage = IMAGE_MIMES.includes(mimeType);

    let previewHtml;
    if (isPdf) {
      previewHtml = `<iframe src="${viewUrl}" class="cv-viewer-frame" title="${esc(fileName || 'CV preview')}"></iframe>`;
    } else if (isImage) {
      previewHtml = `<div class="cv-viewer-image-wrap"><img src="${viewUrl}" alt="${esc(fileName || 'CV preview')}" class="cv-viewer-image" /></div>`;
    } else {
      previewHtml = `
        <div class="cv-viewer-unsupported">
          <p>${Icons.document}</p>
          <p><strong>Preview isn't available for this file type in the browser.</strong></p>
          <p class="text-secondary text-sm">Word documents (.doc/.docx) can't be safely previewed inline. Download the file or open it in a new tab to view it.</p>
        </div>`;
    }

    Modal.open({
      title: fileName || 'CV / Resume',
      bodyHtml: `
        ${previewHtml}
        <div class="modal-actions" style="justify-content: space-between;">
          <a href="${viewUrl}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Open in new tab</a>
          <div style="display:flex; gap: var(--space-2);">
            <button type="button" class="btn btn-ghost btn-sm" data-action="close-modal">Close</button>
            <a href="${downloadUrl}" class="btn btn-primary btn-sm" download="${esc(fileName || 'cv')}">Download</a>
          </div>
        </div>
      `,
      onMount: (modalEl) => {
        modalEl.classList.add('modal-cv-viewer');
      },
    });
  }

  return { open };
})();
