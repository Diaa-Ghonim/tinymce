import { Logger, Mouse, Pipeline, Step, Waiter, UiFinder } from '@ephox/agar';
import { Behaviour, GuiFactory, ModalDialog, Positioning } from '@ephox/alloy';
import { UnitTest } from '@ephox/bedrock';
import { ValueSchema } from '@ephox/boulder';
import { Types } from '@ephox/bridge';
import { Fun, Result } from '@ephox/katamari';

import { renderDialog } from '../../../../main/ts/ui/window/SilverDialog';
import { GuiSetup } from '../../module/AlloyTestUtils';
import I18n from 'tinymce/core/api/util/I18n';
import { Body } from '@ephox/sugar';

UnitTest.asynctest('SilverDialog Event Test', (success, failure) => {

  const dialogSpec = (store) => {
    return {
      internalDialog: {
        title: 'test dialog',
        size: 'normal',
        body: {
          type: 'panel',
          items: []
        },
        buttons: [
          {
            type: 'cancel',
            name: 'cancel',
            text: 'Cancel',
            align: 'end',
            primary: false,
            disabled: false
          },
          {
            type: 'submit',
            name: 'save',
            text: 'Save',
            align: 'end',
            primary: true,
            disabled: false
          }
        ],
        initialData: {},
        onChange: Fun.noop,
        onAction: Fun.noop,
        onTabChange: Fun.noop,
        onSubmit: (api) => {
          store.adder('onSubmit')();
          api.close();
        },
        onClose: store.adder('onClose'),
        onCancel: store.adder('onCancel')
      } as Types.Dialog.Dialog<Record<string, any>>,
      initialData: {},
      dataValidator: ValueSchema.anyValue()
    } ;
  };

  const sGui = (selector, sequence) => Step.async((next, die) => {
    GuiSetup.setup(
      (store, dov, body) => {
        // Build the sink for the component
        return GuiFactory.build({
          dom: {
            tag: 'div'
          },
          behaviours: Behaviour.derive([
            Positioning.config({ })
          ])
        });

      },
      (doc, body, gui, sink, store) => {
        const dialogStuff = renderDialog(
          // Build the component
          dialogSpec(store),
          {
            redial: () => dialogSpec(store),
            closeWindow: () => store.adder('closeWindow')
          },
          {
            shared: {
              getSink: () => Result.value(sink),
              providers: {
                icons: () => <Record<string, string>> {},
                translate: I18n.translate
              }
            },
          }
        );

        const dialog = dialogStuff.dialog;

        // Assert things
        return [
          Step.sync(() => {
            ModalDialog.show(dialog);
          }),
          Waiter.sTryUntil(
            'Waiting for blocker to disappear after clicking close',
            UiFinder.sExists(Body.body(), '.tox-dialog-wrap'),
            100,
            1000
          ),
          Mouse.sClickOn(sink.element(), selector),
          store.sAssertEq('Check event sequence', sequence),
          store.sClear
        ];
      },
      next, die
    );
  });

  Pipeline.async({}, Logger.ts('Test events for Submit, Cancel and X buttons', [
    sGui('button.tox-button:contains(Save)', [ 'onSubmit', 'onClose' ]),
    sGui('button.tox-button:contains(Cancel)', [ 'onCancel', 'onClose' ]),
    sGui('[aria-label="Close"]', [ 'onCancel', 'onClose' ]),
  ]), success, failure);

});