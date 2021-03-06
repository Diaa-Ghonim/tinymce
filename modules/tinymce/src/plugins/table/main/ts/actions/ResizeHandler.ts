/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { HTMLTableCellElement, HTMLTableElement, HTMLTableRowElement, Node, Range } from '@ephox/dom-globals';
import { Option } from '@ephox/katamari';
import { ResizeWire, TableDirection, TableResize } from '@ephox/snooker';
import { Element as SugarElement } from '@ephox/sugar';
import Editor from 'tinymce/core/api/Editor';
import Tools from 'tinymce/core/api/util/Tools';
import * as Events from '../api/Events';
import { hasObjectResizing, hasTableResizeBars, isPercentagesForced, isPixelsForced, isResponsiveForced } from '../api/Settings';
import * as Util from '../core/Util';
import * as Direction from '../queries/Direction';
import * as TableSize from '../queries/TableSize';
import { enforcePercentage, enforcePixels } from './EnforceUnit';
import * as TableWire from './TableWire';

export interface ResizeHandler {
  lazyResize: () => Option<TableResize>;
  lazyWire: () => any;
  destroy: () => void;
}

export const getResizeHandler = function (editor: Editor): ResizeHandler {
  let selectionRng = Option.none<Range>();
  let resize = Option.none<TableResize>();
  let wire = Option.none();
  let startW: number;
  let startRawW: string;

  const isTable = function (elm: Node): elm is HTMLTableElement {
    return elm.nodeName === 'TABLE';
  };

  const lazyResize = function () {
    return resize;
  };

  const lazyWire = function () {
    return wire.getOr(ResizeWire.only(SugarElement.fromDom(editor.getBody())));
  };

  const destroy = function () {
    resize.each(function (sz) {
      sz.destroy();
    });

    wire.each(function (w) {
      TableWire.remove(editor, w);
    });
  };

  editor.on('init', function () {
    const direction = TableDirection(Direction.directionAt);
    const rawWire = TableWire.get(editor);
    wire = Option.some(rawWire);
    if (hasObjectResizing(editor) && hasTableResizeBars(editor)) {
      const lazySizing = (table: SugarElement<HTMLTableElement>) => TableSize.get(editor, table);
      const sz = TableResize.create(rawWire, direction, lazySizing);
      sz.on();
      sz.events.startDrag.bind(function (_event) {
        selectionRng = Option.some(editor.selection.getRng());
      });

      sz.events.beforeResize.bind(function (event) {
        const rawTable = event.table().dom();
        Events.fireObjectResizeStart(editor, rawTable, Util.getPixelWidth(rawTable), Util.getPixelHeight(rawTable));
      });

      sz.events.afterResize.bind(function (event) {
        const table = event.table();
        const rawTable = table.dom();
        Util.removeDataStyle(table);

        selectionRng.each(function (rng) {
          editor.selection.setRng(rng);
          editor.focus();
        });

        Events.fireObjectResized(editor, rawTable, Util.getPixelWidth(rawTable), Util.getPixelHeight(rawTable));
        editor.undoManager.add();
      });

      resize = Option.some(sz);
    }
  });

  // If we're updating the table width via the old mechanic, we need to update the constituent cells' widths/heights too.
  editor.on('ObjectResizeStart', function (e) {
    const targetElm = e.target;
    if (isTable(targetElm)) {

      const tableHasPercentage = Util.getRawWidth(editor, targetElm).exists(Util.isPercentage);

      if (tableHasPercentage && isPixelsForced(editor)) {
        enforcePixels(targetElm);
      } else if (!tableHasPercentage && (isPercentagesForced(editor) || isResponsiveForced(editor))) {
        enforcePercentage(targetElm);
      }

      startW = e.width;
      startRawW = Util.getRawWidth(editor, targetElm).getOr('');
    }
  });

  interface CellSize { cell: HTMLTableCellElement; width: string }

  editor.on('ObjectResized', function (e) {
    const targetElm = e.target;
    if (isTable(targetElm)) {
      const table = targetElm;

      if (Util.isPercentage(startRawW)) {
        const percentW = parseFloat(startRawW.replace('%', ''));
        const targetPercentW = e.width * percentW / startW;
        editor.dom.setStyle(table, 'width', targetPercentW + '%');
      } else {
        const newCellSizes: CellSize[] = [];
        Tools.each(table.rows, function (row: HTMLTableRowElement) {
          Tools.each(row.cells, function (cell: HTMLTableCellElement) {
            const width = editor.dom.getStyle(cell, 'width', true);
            newCellSizes.push({
              cell,
              width
            });
          });
        });

        Tools.each(newCellSizes, function (newCellSize: CellSize) {
          editor.dom.setStyle(newCellSize.cell, 'width', newCellSize.width);
          editor.dom.setAttrib(newCellSize.cell, 'width', null);
        });
      }
    }
  });

  editor.on('SwitchMode', () => {
    lazyResize().each(function (resize) {
      if (editor.mode.isReadOnly()) {
        resize.hideBars();
      } else {
        resize.showBars();
      }
    });
  });

  return {
    lazyResize,
    lazyWire,
    destroy
  };
};
