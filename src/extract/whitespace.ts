/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** 首尾空格承载语义的片段：它会被拼接到相邻内容上。 */
export function hasSignificantWhitespace(text: string): boolean {
  return text !== text.trim() && text.trim().length > 0;
}
