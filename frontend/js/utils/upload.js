/**
 * JOB RUSH — Upload helper.
 * Wraps the multipart upload endpoints so pages don't each build
 * their own FormData/fetch boilerplate. Every function here returns
 * whatever the backend returns (storagePath, and publicUrl where the
 * bucket is public) — callers are responsible for the follow-up call
 * that attaches the upload to a record (portfolio media, a
 * verification submission, a message, etc).
 */
const Upload = (function () {
  function pickFile({ accept = 'image/*,video/*' } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
      input.click();
    });
  }

  async function uploadPortfolioMedia(file, onProgress, lifecycleCallbacks) {
    const isVideo = file.type.startsWith('video/');
    const formData = new FormData();
    formData.append('file', file);
    const path = `/storage/portfolio/${isVideo ? 'video' : 'image'}`;
    return onProgress
      ? API.uploadWithProgress(path, formData, onProgress, lifecycleCallbacks)
      : API.upload(path, formData);
  }

  async function uploadProfilePicture(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    return onProgress
      ? API.uploadWithProgress('/storage/profile-picture', formData, onProgress)
      : API.upload('/storage/profile-picture', formData);
  }

  async function uploadVerificationDocument(file, documentType) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    return API.upload('/storage/verification-document', formData);
  }

  async function uploadCv(file) {
    const formData = new FormData();
    formData.append('file', file);
    return API.upload('/storage/cv', formData);
  }

  async function uploadChatMedia(file) {
    let category = 'document';
    if (file.type.startsWith('image/')) category = 'image';
    else if (file.type.startsWith('video/')) category = 'video';
    else if (file.type.startsWith('audio/')) category = 'voice_note';
    const formData = new FormData();
    formData.append('file', file);
    const result = await API.upload(`/storage/chat/${category}`, formData);
    return { ...result, mediaType: category };
  }

  async function uploadDisputeEvidence(file) {
    let category = 'document';
    if (file.type.startsWith('image/')) category = 'image';
    else if (file.type.startsWith('video/')) category = 'video';
    const formData = new FormData();
    formData.append('file', file);
    return API.upload(`/storage/dispute-evidence/${category}`, formData);
  }

  return {
    pickFile,
    uploadPortfolioMedia,
    uploadProfilePicture,
    uploadVerificationDocument,
    uploadCv,
    uploadChatMedia,
    uploadDisputeEvidence,
  };
})();
