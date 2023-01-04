import * as vscode from "vscode";

import { readFile } from "fs/promises";
import { promisify } from "util";
import { gunzip } from "zlib";
import * as jsmigemo from "jsmigemo";

// https://github.com/microsoft/TypeScript/issues/46984#issuecomment-984151454
type ToADT<T> = {
  [K in keyof T]: {
    kind: K;
  } & T[K];
}[keyof T];

export function activate(context: vscode.ExtensionContext) {
  type CallbackType = (...args: unknown[]) => void;

  // register command with activeTextEditor check.
  const registerCommand = (commandId: string, callback: CallbackType): void => {
    const callbackWithCheck = (f: CallbackType): CallbackType => {
      if (vscode.window.activeTextEditor) {
        return f;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return () => {};
      }
    };
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, callbackWithCheck(callback))
    );
  };

  // create isearch object.
  const isearch = new Isearch(
    context.asAbsolutePath("resources/migemo-compact-dict.gz")
  );
  context.subscriptions.push(isearch);

  // register commands
  //
  registerCommand("migemo-isearch.isearch-forward", () =>
    isearch.transaction({ kind: "isearchForward" })
  );
  registerCommand("migemo-isearch.isearch-backward", () =>
    isearch.transaction({ kind: "isearchBackward" })
  );
  registerCommand("migemo-isearch.cancel", () =>
    isearch.transaction({ kind: "cancel" })
  );

  /*
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
    () => isearch.transaction({kind:"quit"})
  ));
  */
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}

class Isearch {
  private state_: State;
  private inputBox_: vscode.InputBox;

  constructor(dicPath: string) {
    const migemo = new jsmigemo.Migemo();
    // expand dic and set.
    readFile(dicPath)
      .then((b) => promisify(gunzip)(b))
      .then((b) => {
        const dic = new jsmigemo.CompactDictionary(b.buffer);
        migemo.setDict(dic);
      });

    this.inputBox_ = vscode.window.createInputBox();
    this.inputBox_.onDidChangeValue((value) => {
      this.transaction({ kind: "queryChanged", query: value });
    });
    this.inputBox_.onDidAccept(() => {
      console.log("onDidAccept");
      this.transaction({ kind: "inputBoxAccepted" });
    });
    this.inputBox_.onDidHide(() => {
      console.log("onDidHide");
      this.transaction({ kind: "inputBoxHided" });
    });

    this.state_ = new StateInit({
      migemo,
      inputBox: this.inputBox_,
      searchRing: [],
    });
    this.state_.enter();
  }

  public dispose(): void {
    this.inputBox_.dispose();
  }

  public transaction(event: Event): void {
    const newState = this.state_.transition(event);
    if (newState) {
      this.state_.exit();
      this.state_ = newState;
      this.state_.enter();
    }
  }
}

interface Events {
  isearchForward: Record<string, unknown>;
  isearchBackward: Record<string, unknown>;
  cancel: Record<string, unknown>;
  queryChanged: { query: string };
  inputBoxAccepted: Record<string, unknown>;
  inputBoxHided: Record<string, unknown>;
  // quit: Record<string, unknown>;
}

type Event = ToADT<Events>;

interface State {
  enter(): void;
  exit(): void;
  transition(event: Event): State | undefined;
}

/** マッチ文字列を装飾・装飾解除する
 *
 * @param editor
 * @param ranges マッチ範囲
 * @param currentIndex 現在のマッチとして装飾するマッチ範囲のインデックス。
 * -1で現在のマッチ範囲無し
 * @returns void
 */
const updateDecoration = (
  editor: vscode.TextEditor,
  ranges: vscode.Range[],
  currentIndex: number
) => {
  if (ranges.length === 0) {
    // 装飾解除
    editor.setDecorations(currentMatchedWordsDecorationType, []);
    editor.setDecorations(currentMatchedLineDecorationType, []);
    editor.setDecorations(otherMatchedWordsDecorationType, []);
    return;
  }

  const r = [...ranges];
  if (currentIndex !== -1) {
    // 現在のマッチ位置・行をデコレーション
    const c = r.splice(currentIndex, 1)[0];
    const currentMatchedWords: vscode.DecorationOptions[] = [{ range: c }];
    editor.setDecorations(
      currentMatchedWordsDecorationType,
      currentMatchedWords
    );
    editor.setDecorations(
      currentMatchedLineDecorationType,
      currentMatchedWords
    );
  }

  // 残りのマッチ位置をデコレーション
  const otherMatchedWords: vscode.DecorationOptions[] = r.map((r) => {
    return { range: r };
  });
  editor.setDecorations(otherMatchedWordsDecorationType, otherMatchedWords);
};

/** カーソルを移動し、その位置が見える様にスクロールする
 *
 * @param editor
 * @param pos
 */
const moveCursor = (
  editor: vscode.TextEditor,
  pos: vscode.Position | vscode.Selection
) => {
  if (pos instanceof vscode.Selection) {
    editor.selection = pos;
  } else {
    editor.selection = new vscode.Selection(pos, pos);
  }
  editor.revealRange(
    editor.selection,
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
};

/** 検索する
 *
 * @param migemo
 * @param editor
 * @param queryStr クエリ文字列
 * @param cursor 検索開始位置
 * @returns [マッチした文字列[], 検索開始位置から一番近いマッチ文字列インデックス]
 */
const search = (
  migemo: jsmigemo.Migemo,
  editor: vscode.TextEditor,
  queryStr: string,
  cursor: vscode.Selection
): [vscode.Range[], number] => {
  const doc = editor.document;
  const text = doc.getText();
  const regex = new RegExp(migemo.query(queryStr), "g");
  let match;
  const matches: vscode.Range[] = [];
  while ((match = regex.exec(text))) {
    matches.push(
      new vscode.Range(
        doc.positionAt(match.index),
        doc.positionAt(match.index + match[0].length)
      )
    );
  }
  const i = matches.findIndex((r) => r.start.isAfterOrEqual(cursor.start));

  return [matches, i];
};

// Color of the current search match
const currentMatchedWordsDecorationType =
  vscode.window.createTextEditorDecorationType({
    backgroundColor: { id: "editor.findMatchBackground" },
  });

// Color of the current search match line
const currentMatchedLineDecorationType =
  vscode.window.createTextEditorDecorationType({
    backgroundColor: { id: "editor.rangeHighlightBackground" },
    isWholeLine: true,
  });

// Color of the other search matches.
const otherMatchedWordsDecorationType =
  vscode.window.createTextEditorDecorationType({
    backgroundColor: { id: "editor.findMatchHighlightBackground" },
  });

class ContextKey {
  private _name: string;
  private _lastValue: boolean | undefined;

  constructor(name: string) {
    this._name = name;
  }

  get value(): boolean | undefined {
    return this._lastValue;
  }

  public set(value: boolean): void {
    if (this._lastValue === value) {
      return;
    }
    this._lastValue = value;
    vscode.commands.executeCommand("setContext", this._name, this._lastValue);
  }
}

/** 状態マシン全体にわたって共有される変数
 *
 */
interface Context {
  /// migemo engine
  migemo: jsmigemo.Migemo;
  /// isearch input box
  inputBox: vscode.InputBox;
  /// search history
  searchRing: string[];
}

/** StateSearching 検索中状態に渡って共有される変数
 *
 */
interface SearchContext {
  context: Context;

  /// 検索対象となるエディタ
  editor: vscode.TextEditor;
  /// 検索開始時のカーソル位置
  initialSelection: vscode.Selection;
  /// 検索コンテキストを保持
  inIsearchMode: ContextKey;
}

/** 検索文字列に関して共有される文字列
 *
 */
interface MatchContext {
  searchContext: SearchContext;

  /// 検索結果
  matches: vscode.Range[];
  /// 初回マッチ位置(ラップアラウンド判定用)
  initialMatchIndex: number;
  /// 現在のマッチ位置
  currentMatchIndex: number;
}

/** 待機状態
 *
 * 拡張機能がロードされ、あるいは実行した検索が終了し、
 * 次回検索が開始されるのを待っている状態。
 */
class StateInit implements State {
  private context_: Context;

  constructor(context: Context) {
    this.context_ = context;
  }

  enter(): void {
    console.debug("StateInit: enter()");
    this.context_.inputBox.hide();
  }

  exit(): void {
    console.debug("StateInit: exit()");
    // nop
  }

  transition(event: Event): State | undefined {
    console.debug("StateInit: transaction(): Event: ", event);
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    switch (event.kind) {
      case "isearchForward": {
        const searchContext: SearchContext = {
          context: this.context_,
          editor,
          initialSelection: editor.selection,
          inIsearchMode: new ContextKey("migemo-isearch.inIsearchMode"),
        };
        return new StateSearching(searchContext);
      }

      case "isearchBackward": {
        // TODO
        throw new Error('Not implemented yet: "isearchBackward" case');
      }

      default:
        break;
    }
    return undefined;
  }
}

/** 検索中状態
 *
 * 検索を開始し、InputBoxが表示されている状態
 *
 * 検索中でも、クエリ文字列が無い/終端に到達したなど各種状態があり、
 * それを本状態の内部状態(ネストした状態)として管理する。
 *
 * 検索中状態として:
 *
 * - コンテクストキー "migemo-isearch.inIsearchMode" の有効無効管理
 * - TextEditorに紐付けられたマッチ文字列装飾の管理
 * - 内部状態に共通のイベント処理
 *
 * を行う
 */
class StateSearching implements State {
  private searchContext_: SearchContext;

  private subState_: State;

  constructor(searchContext: SearchContext) {
    this.searchContext_ = searchContext;
    this.subState_ = new SubStateEmpty(this.searchContext_);
  }

  enter(): void {
    console.debug("StateSearching: enter()");
    // 検索中モードセット
    this.searchContext_.inIsearchMode.set(true);

    // init input box
    const ib = this.searchContext_.context.inputBox;
    ib.title = "ISearch migemo";
    ib.placeholder = "Query";
    ib.step = 0;
    ib.totalSteps = 0;
    ib.validationMessage = "";
    ib.value = "";
    ib.show();

    this.subState_.enter();
  }

  exit(): void {
    console.debug("StateSearching: exit()");
    this.subState_.exit();

    // 装飾をクリア
    updateDecoration(this.searchContext_.editor, [], -1);
    // 検索中モードクリア
    this.searchContext_.inIsearchMode.set(false);
  }

  transition(event: Event): State | undefined {
    console.debug("StateSearching: transaction(): Event: ", event);
    const internalNextState = this.subState_.transition(event);
    if (internalNextState) {
      // 内部での遷移で完結する
      this.subState_.exit();
      this.subState_ = internalNextState;
      this.subState_.enter();
      return undefined;
    }

    let nextState: State | undefined = undefined;
    switch (event.kind) {
      case "inputBoxAccepted":
        // 検索確定
        nextState = new StateInit(this.searchContext_.context);
        break;

      case "cancel":
      case "inputBoxHided":
        // 検索取り消し。カーソル位置を復元する
        moveCursor(
          this.searchContext_.editor,
          this.searchContext_.initialSelection
        );
        nextState = new StateInit(this.searchContext_.context);
        break;

      default:
        break;
    }
    return nextState;
  }
}

/** 検索中・クエリ文字列なし状態
 *
 */
class SubStateEmpty implements State {
  private searchContext_: SearchContext;

  constructor(searchContext: SearchContext) {
    this.searchContext_ = searchContext;
  }

  enter(): void {
    console.debug("SubStateEmpty: enter()");

    // input box 調整
    const ib = this.searchContext_.context.inputBox;
    ib.step = 0;
    ib.totalSteps = 0;
    ib.validationMessage = "";

    // 装飾をクリア
    updateDecoration(this.searchContext_.editor, [], -1);

    // カーソル移動
    moveCursor(
      this.searchContext_.editor,
      this.searchContext_.initialSelection
    );
  }

  exit(): void {
    console.debug("SubStateEmpty: exit()");
    // nop
  }

  transition(event: Event): State | undefined {
    console.debug("SubStateEmpty: transition()", event);

    switch (event.kind) {
      case "isearchForward": {
        // TODO 検索ringからもってくる
        throw new Error('Not implemented yet: "isearchForward" case');
      }

      case "isearchBackward": {
        // TODO 検索ringからもってくる
        throw new Error('Not implemented yet: "isearchBackward" case');
      }

      case "queryChanged": {
        const queryStr = event.query;
        if (queryStr === "") {
          return undefined;
        }
        // 検索
        const [matches, idx] = search(
          this.searchContext_.context.migemo,
          this.searchContext_.editor,
          queryStr,
          this.searchContext_.initialSelection
        );

        const matchContext: MatchContext = {
          searchContext: this.searchContext_,
          matches,
          initialMatchIndex: idx,
          currentMatchIndex: idx,
        };

        if (idx !== -1) {
          // 見つかった
          return new SubStateSearching(matchContext);
        } else {
          // 見つからない
          return new SubStateReachedEnd(matchContext);
        }
      }
      default:
        break;
    }
    return undefined;
  }
}

/** 検索中・マッチ状態
 *
 */
class SubStateSearching implements State {
  private matchContext_: MatchContext;

  constructor(matchContext: MatchContext) {
    this.matchContext_ = matchContext;
  }

  enter(): void {
    console.debug("SubStateSearching: enter()");
    // input box 調整
    const ib = this.matchContext_.searchContext.context.inputBox;
    ib.step = this.matchContext_.currentMatchIndex + 1;
    ib.totalSteps = this.matchContext_.matches.length;
    ib.validationMessage = "";

    // 装飾適用
    updateDecoration(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches,
      this.matchContext_.currentMatchIndex
    );

    // マッチしている後ろにカーソル移動
    moveCursor(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches[this.matchContext_.currentMatchIndex].end
    );
  }

  exit(): void {
    console.debug("SubStateSearching: exit()");
    // nop
  }

  transition(event: Event): State | undefined {
    console.debug("SubStateSearching: transaction(): Event: ", event);
    switch (event.kind) {
      case "isearchForward": {
        if (
          this.matchContext_.currentMatchIndex + 1 <
          this.matchContext_.matches.length
        ) {
          // 次あり
          return new SubStateSearching({
            ...this.matchContext_,
            currentMatchIndex: this.matchContext_.currentMatchIndex + 1,
          });
        } else {
          // 次無し
          return new SubStateReachedEnd(this.matchContext_);
        }
      }

      case "isearchBackward": {
        // TODO
        throw new Error('Not implemented yet: "isearchBackward" case');
      }

      case "queryChanged": {
        const queryStr = event.query;
        if (queryStr === "") {
          return new SubStateEmpty(this.matchContext_.searchContext);
        }

        // 検索
        const [matches, idx] = search(
          this.matchContext_.searchContext.context.migemo,
          this.matchContext_.searchContext.editor,
          queryStr,
          this.matchContext_.searchContext.initialSelection // TODO DELで過去のマッチ位置に戻る対応。これだと単に最初から探すだけ。
        );

        const matchContext: MatchContext = {
          searchContext: this.matchContext_.searchContext,
          matches,
          initialMatchIndex: idx,
          currentMatchIndex: idx,
        };

        if (idx !== -1) {
          // 見つかった
          return new SubStateSearching(matchContext);
        } else {
          // 見つからない
          return new SubStateReachedEnd(matchContext);
        }
      }
      default:
        break;
    }
    return undefined;
  }
}

/** 検索中・ファイル終端まで到達or該当なし状態
 *
 */
class SubStateReachedEnd implements State {
  private matchContext_: MatchContext;

  constructor(matchContext: MatchContext) {
    this.matchContext_ = matchContext;
  }

  enter(): void {
    console.debug("SubStateReachedEnd: enter()");
    // input box 調整
    const ib = this.matchContext_.searchContext.context.inputBox;
    ib.step = this.matchContext_.currentMatchIndex + 1;
    ib.totalSteps = this.matchContext_.matches.length;
    ib.validationMessage = {
      message: "Failing search",
      severity: vscode.InputBoxValidationSeverity.Info,
    };

    updateDecoration(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches,
      this.matchContext_.currentMatchIndex
    );
  }
  exit(): void {
    console.debug("SubStateReachedEnd: exit()");
    // nop
  }
  transition(event: Event): State | undefined {
    console.debug("SubStateReachedEnd: transaction(): Event: ", event);
    switch (event.kind) {
      case "isearchForward": {
        // 先頭に戻る
        if (this.matchContext_.matches.length > 0) {
          // ラップ中
          return new SubStateWrapped({
            ...this.matchContext_,
            currentMatchIndex: 0,
          });
        } else {
          // 移動先がないのでこのまま
          return undefined;
        }
      }
      case "isearchBackward": {
        // TODO
        throw new Error('Not implemented yet: "isearchBackward" case');
      }
      case "queryChanged": {
        // クエリ変更
        const queryStr = event.query;
        if (queryStr === "") {
          return new SubStateEmpty(this.matchContext_.searchContext);
        }

        // 検索
        const [matches, idx] = search(
          this.matchContext_.searchContext.context.migemo,
          this.matchContext_.searchContext.editor,
          queryStr,
          this.matchContext_.searchContext.initialSelection // TODO DELで過去のマッチ位置に戻る対応。これだと単に最初から探すだけ。
        );

        const matchContext: MatchContext = {
          searchContext: this.matchContext_.searchContext,
          matches,
          initialMatchIndex: idx,
          currentMatchIndex: idx,
        };

        if (idx !== -1) {
          // 見つかった
          return new SubStateSearching(matchContext);
        } else {
          // 見つからない
          return new SubStateReachedEnd(matchContext);
        }
      }
      default:
        break;
    }
    return undefined;
  }
}

/** 検索中・終端到達後ラップアラウンド中状態
 *
 */
class SubStateWrapped implements State {
  private matchContext_: MatchContext;

  constructor(matchContext: MatchContext) {
    this.matchContext_ = matchContext;
  }
  enter(): void {
    console.debug("SubStateWrapped: enter()");
    // input box 調整
    const ib = this.matchContext_.searchContext.context.inputBox;
    ib.step = this.matchContext_.currentMatchIndex + 1;
    ib.totalSteps = this.matchContext_.matches.length;

    if (
      this.matchContext_.currentMatchIndex <
      this.matchContext_.initialMatchIndex
    ) {
      // 先頭から検索中
      ib.validationMessage = {
        message: "Wrapped",
        severity: vscode.InputBoxValidationSeverity.Info,
      };
    } else {
      // 一周過ぎた
      ib.validationMessage = {
        message: "Overwrapped",
        severity: vscode.InputBoxValidationSeverity.Info,
      };
    }

    // 装飾適用
    updateDecoration(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches,
      this.matchContext_.currentMatchIndex
    );

    // マッチしている後ろにカーソル移動
    moveCursor(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches[this.matchContext_.currentMatchIndex].end
    );
  }
  exit(): void {
    console.debug("SubStateWrapped: exit()");
    // nop
  }

  transition(event: Event): State | undefined {
    console.debug("SubStateWrapped: transaction(): Event: ", event);
    switch (event.kind) {
      case "isearchForward": {
        if (
          this.matchContext_.currentMatchIndex + 1 <
          this.matchContext_.matches.length
        ) {
          // 次あり
          return new SubStateWrapped({
            ...this.matchContext_,
            currentMatchIndex: this.matchContext_.currentMatchIndex + 1,
          });
        } else {
          // 次無し
          return new SubStateReachedEnd(this.matchContext_);
        }
      }

      case "isearchBackward": {
        // TODO
        throw new Error('Not implemented yet: "isearchBackward" case');
      }

      case "queryChanged": {
        const queryStr = event.query;
        if (queryStr === "") {
          return new SubStateEmpty(this.matchContext_.searchContext);
        }

        // 検索
        const [matches, idx] = search(
          this.matchContext_.searchContext.context.migemo,
          this.matchContext_.searchContext.editor,
          queryStr,
          this.matchContext_.searchContext.initialSelection // TODO DELで過去のマッチ位置に戻る対応。これだと単に最初から探すだけ。
        );

        const matchContext: MatchContext = {
          searchContext: this.matchContext_.searchContext,
          matches,
          initialMatchIndex: idx,
          currentMatchIndex: idx,
        };

        if (idx !== -1) {
          // 見つかった
          return new SubStateSearching(matchContext);
        } else {
          // 見つからない
          return new SubStateReachedEnd(matchContext);
        }
      }
      default:
        break;
    }
    return undefined;
  }
}
