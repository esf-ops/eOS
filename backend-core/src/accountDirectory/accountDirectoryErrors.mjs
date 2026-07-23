export class AccountDirectoryError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   * @param {object} [extra]
   */
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.name = "AccountDirectoryError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}
