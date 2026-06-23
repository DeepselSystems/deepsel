import { create } from 'zustand';
import debounce from 'lodash/debounce';

const FileAttachmentState = create((setState, getState) => {
  /**
   * Fetch upload size limit
   *
   * @param {() => Promise<UploadSizeLimit>} apiFunc
   * @return {Promise<*>}
   */
  const fetchUploadSizeLimit = async (apiFunc) => {
    // if uploadSizeLimit state already exists
    if (getState().uploadSizeLimit) {
      return getState().uploadSizeLimit;
    }

    // call api to get uploadSizeLimit
    try {
      setState({ isFetchingUploadSizeLimit: true });
      const uploadSizeLimit = await Promise.resolve(apiFunc());
      setState({ uploadSizeLimit });
    } catch (e) {
      console.log(e);
    } finally {
      setState({ isFetchingUploadSizeLimit: false });
    }
  };

  /**
   * Fetch upload size limit with debounced time
   *
   * @type {DebouncedFuncLeading<(function(*): Promise<*>)|*> | DebouncedFunc<(function(*): Promise<*>)|*>}
   */
  const debouncedFetchUploadSizeLimit = debounce(fetchUploadSizeLimit, 250);

  return {
    /** region initial states */
    uploadSizeLimit: /** @type {UploadSizeLimit | null} */ null,
    isFetchingUploadSizeLimit: /** @type {boolean} */ false,

    // please add more initial states right here...
    /** endregion initial states */

    /** region store functions */
    /**
     * @param {() => Promise<UploadSizeLimit>} apiFunc
     * @return {ReturnType<(function(*): Promise<*>)|*>}
     */
    fetchUploadSizeLimit: (apiFunc) => debouncedFetchUploadSizeLimit(apiFunc),

    // please add more functions right here...
    /** endregion store functions */
  };
});

export default FileAttachmentState;
