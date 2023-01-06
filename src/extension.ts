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
  registerCommand("migemo-isearch.isearch-ring-retreat", () =>
    isearch.transaction({ kind: "isearchRingRetreat" })
  );
  registerCommand("migemo-isearch.isearch-ring-advance", () =>
    isearch.transaction({ kind: "isearchRingAdvance" })
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
      searchRing: new SearchRing(),
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
  isearchRingRetreat: Record<string, unknown>;
  isearchRingAdvance: Record<string, unknown>;
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
 * @returns [マッチした文字列[], 検索開始位置から前方に向け一番近いマッチ文字列インデックス]
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
  searchRing: SearchRing;
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

  /// 検索履歴呼び出しイテレータ
  ringIter: RingIter;
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
          ringIter: this.context_.searchRing.iter(),
        };
        return new StateSearching(searchContext, true);
      }

      case "isearchBackward": {
        const searchContext: SearchContext = {
          context: this.context_,
          editor,
          initialSelection: editor.selection,
          inIsearchMode: new ContextKey("migemo-isearch.inIsearchMode"),
          ringIter: this.context_.searchRing.iter(),
        };
        return new StateSearching(searchContext, false);
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

  constructor(searchContext: SearchContext, isForward: boolean) {
    this.searchContext_ = searchContext;
    if (isForward) {
      this.subState_ = new SubStateEmpty(this.searchContext_);
    } else {
      this.subState_ = new SubStateEmptyBackward(this.searchContext_);
    }
  }

  enter(): void {
    console.debug("StateSearching: enter()");
    // 検索中モードセット
    this.searchContext_.inIsearchMode.set(true);

    // init input box
    const ib = this.searchContext_.context.inputBox;
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
      case "isearchRingRetreat": {
        // M-p
        const queryStr = this.searchContext_.ringIter.getRetreat();
        if (queryStr == null) {
          // サーチリング先頭まで到達
          this.searchContext_.context.inputBox.validationMessage = {
            message: "Beginning of history",
            severity: vscode.InputBoxValidationSeverity.Info,
          };
        } else {
          // サーチリングの文字列を設定されたとして状態遷移
          this.searchContext_.context.inputBox.value = queryStr;
          const l = queryStr.length;
          this.searchContext_.context.inputBox.valueSelection = [l, l];
          nextState = this.transition({
            kind: "queryChanged",
            query: queryStr,
          });
        }
        break;
      }

      case "isearchRingAdvance": {
        // M-n
        const queryStr = this.searchContext_.ringIter.getAdvance();
        if (queryStr == null) {
          // サーチリング末尾まで到達
          this.searchContext_.context.inputBox.validationMessage = {
            message: "End of history",
            severity: vscode.InputBoxValidationSeverity.Info,
          };
        } else {
          // サーチリングの文字列を設定されたとして状態遷移
          this.searchContext_.context.inputBox.value = queryStr;
          const l = queryStr.length;
          this.searchContext_.context.inputBox.valueSelection = [l, l];
          nextState = this.transition({
            kind: "queryChanged",
            query: queryStr,
          });
        }
        break;
      }

      case "inputBoxAccepted":
        // 検索確定
        this.searchContext_.context.searchRing.add(
          this.searchContext_.context.inputBox.value
        );
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
    ib.title = "ISearch migemo";
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
        // サーチリングから最新のクエリを取りだし、クエリ変更処理
        const queryStr = this.searchContext_.ringIter.newest();
        if (queryStr != null) {
          this.searchContext_.context.inputBox.value = queryStr;
          return onQueryChangedForward(this.searchContext_, queryStr);
        } else {
          this.searchContext_.context.inputBox.validationMessage = {
            message: "No previous search string",
            severity: vscode.InputBoxValidationSeverity.Info,
          };
        }
        break;
      }
      case "isearchBackward":
        // 後方検索に変更
        return new SubStateEmptyBackward(this.searchContext_);

      case "queryChanged":
        // クエリ変更
        return onQueryChangedForward(this.searchContext_, event.query);

      default:
        break;
    }
    return undefined;
  }
}
/** 後方検索中・クエリ文字列なし状態
 *
 */
class SubStateEmptyBackward implements State {
  private searchContext_: SearchContext;

  constructor(searchContext: SearchContext) {
    this.searchContext_ = searchContext;
  }

  enter(): void {
    console.debug("SubStateEmptyBackward: enter()");

    // input box 調整
    const ib = this.searchContext_.context.inputBox;
    ib.title = "ISearch migemo Backward";
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
    console.debug("SubStateEmptyBackward: exit()");
    // nop
  }

  transition(event: Event): State | undefined {
    console.debug("SubStateEmptyBackward: transition()", event);

    switch (event.kind) {
      case "isearchForward":
        // 前方検索に変更
        return new SubStateEmpty(this.searchContext_);

      case "isearchBackward": {
        // サーチリングから最新のクエリを取りだし、クエリ変更処理
        const queryStr = this.searchContext_.ringIter.newest();
        if (queryStr != null) {
          this.searchContext_.context.inputBox.value = queryStr;
          return onQueryChangedBackward(this.searchContext_, queryStr);
        } else {
          this.searchContext_.context.inputBox.validationMessage = {
            message: "No previous search string",
            severity: vscode.InputBoxValidationSeverity.Info,
          };
        }
        break;
      }

      case "queryChanged":
        // クエリ変更
        return onQueryChangedBackward(this.searchContext_, event.query);

      default:
        break;
    }
    return undefined;
  }
}

/** 前方検索中・マッチ状態
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
    ib.title = "ISearch migemo";
    ib.step = this.matchContext_.currentMatchIndex + 1;
    ib.totalSteps = this.matchContext_.matches.length;
    ib.validationMessage = "";

    // 装飾適用
    updateDecoration(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches,
      this.matchContext_.currentMatchIndex
    );

    // マッチしている文字列終端にカーソル移動
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
          // 前方あり
          return new SubStateSearching({
            ...this.matchContext_,
            currentMatchIndex: this.matchContext_.currentMatchIndex + 1,
          });
        } else {
          // 前方無し
          return new SubStateReachedEnd(this.matchContext_);
        }
      }

      case "isearchBackward":
        // 同じマッチ位置で前方検索から後方検索に移行
        return new SubStateSearchingBackward(this.matchContext_);

      case "queryChanged":
        // クエリ変更
        return onQueryChangedForward(
          this.matchContext_.searchContext,
          event.query
        );

      default:
        break;
    }
    return undefined;
  }
}

/** 後方検索中・マッチ状態
 *
 */
class SubStateSearchingBackward implements State {
  private matchContext_: MatchContext;

  constructor(matchContext: MatchContext) {
    this.matchContext_ = matchContext;
  }

  enter(): void {
    console.debug("SubStateSearchingBackward: enter()");
    // input box 調整
    const ib = this.matchContext_.searchContext.context.inputBox;
    ib.title = "ISearch migemo Backward";
    ib.step = this.matchContext_.currentMatchIndex + 1;
    ib.totalSteps = this.matchContext_.matches.length;
    ib.validationMessage = "";

    // 装飾適用
    updateDecoration(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches,
      this.matchContext_.currentMatchIndex
    );

    // マッチしている文字列先頭にカーソル移動
    moveCursor(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches[this.matchContext_.currentMatchIndex].start
    );
  }

  exit(): void {
    console.debug("SubStateSearchingBackward: exit()");
    // nop
  }

  transition(event: Event): State | undefined {
    console.debug("SubStateSearchingBackward: transaction(): Event: ", event);
    switch (event.kind) {
      case "isearchForward":
        // 同じマッチ位置で後方検索から前方検索に移行
        return new SubStateSearching(this.matchContext_);

      case "isearchBackward": {
        if (this.matchContext_.currentMatchIndex > 0) {
          // 後方あり
          return new SubStateSearchingBackward({
            ...this.matchContext_,
            currentMatchIndex: this.matchContext_.currentMatchIndex - 1,
          });
        } else {
          // 後方無し
          return new SubStateReachedEndBackward(this.matchContext_);
        }
      }

      case "queryChanged":
        // クエリ変更
        return onQueryChangedBackward(
          this.matchContext_.searchContext,
          event.query
        );

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
    ib.title = "ISearch migemo";
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
        // ファイル先頭に戻る
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
        // ファイル末尾から後方検索開始
        if (this.matchContext_.matches.length > 0) {
          // ラップ中
          return new SubStateWrapped({
            ...this.matchContext_,
            currentMatchIndex: this.matchContext_.matches.length - 1,
          });
        } else {
          // 移動先がないのでこのまま
          return undefined;
        }
      }
      case "queryChanged":
        // クエリ変更
        return onQueryChangedForward(
          this.matchContext_.searchContext,
          event.query
        );

      default:
        break;
    }
    return undefined;
  }
}

/** 後方検索中・ファイル先頭まで到達or該当なし状態
 *
 */
class SubStateReachedEndBackward implements State {
  private matchContext_: MatchContext;

  constructor(matchContext: MatchContext) {
    this.matchContext_ = matchContext;
  }

  enter(): void {
    console.debug("SubStateReachedEndBackward: enter()");
    // input box 調整
    const ib = this.matchContext_.searchContext.context.inputBox;
    ib.title = "ISearch migemo Backward";
    ib.step = this.matchContext_.currentMatchIndex + 1;
    ib.totalSteps = this.matchContext_.matches.length;
    ib.validationMessage = {
      message: "Failing search Backward",
      severity: vscode.InputBoxValidationSeverity.Info,
    };

    updateDecoration(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches,
      this.matchContext_.currentMatchIndex
    );
  }
  exit(): void {
    console.debug("SubStateReachedEndBackward: exit()");
    // nop
  }
  transition(event: Event): State | undefined {
    console.debug("SubStateReachedEndBackward: transaction(): Event: ", event);
    switch (event.kind) {
      case "isearchForward": {
        // ファイル先頭から前方検索開始
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
        // ファイル末尾に戻る
        if (this.matchContext_.matches.length > 0) {
          // ラップ中
          return new SubStateWrappedBackward({
            ...this.matchContext_,
            currentMatchIndex: this.matchContext_.matches.length - 1,
          });
        } else {
          // 移動先がないのでこのまま
          return undefined;
        }
      }
      case "queryChanged":
        // クエリ変更
        return onQueryChangedBackward(
          this.matchContext_.searchContext,
          event.query
        );

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
    ib.title = "ISearch migemo";
    ib.step = this.matchContext_.currentMatchIndex + 1;
    ib.totalSteps = this.matchContext_.matches.length;

    if (
      this.matchContext_.currentMatchIndex <
      this.matchContext_.initialMatchIndex
    ) {
      // ファイル先頭から前方検索中
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

    // マッチしている文字列終端にカーソル移動
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
          // 前方あり
          return new SubStateWrapped({
            ...this.matchContext_,
            currentMatchIndex: this.matchContext_.currentMatchIndex + 1,
          });
        } else {
          // 前方無し
          return new SubStateReachedEnd(this.matchContext_);
        }
      }

      case "isearchBackward":
        // その場で後方検索に反転
        return new SubStateWrappedBackward(this.matchContext_);

      case "queryChanged":
        // クエリ変更
        return onQueryChangedForward(
          this.matchContext_.searchContext,
          event.query
        );

      default:
        break;
    }
    return undefined;
  }
}

/** 後方検索中・先頭到達後ラップアラウンド中状態
 *
 */
class SubStateWrappedBackward implements State {
  private matchContext_: MatchContext;

  constructor(matchContext: MatchContext) {
    this.matchContext_ = matchContext;
  }
  enter(): void {
    console.debug("SubStateWrappedBackward: enter()");
    // input box 調整
    const ib = this.matchContext_.searchContext.context.inputBox;
    ib.title = "ISearch migemo Backward";
    ib.step = this.matchContext_.currentMatchIndex + 1;
    ib.totalSteps = this.matchContext_.matches.length;

    if (
      this.matchContext_.currentMatchIndex <=
      this.matchContext_.initialMatchIndex
    ) {
      // 先頭から検索中
      ib.validationMessage = {
        message: "Overwrapped Backward",
        severity: vscode.InputBoxValidationSeverity.Info,
      };
    } else {
      // 一周過ぎた
      ib.validationMessage = {
        message: "Wrapped Backward",
        severity: vscode.InputBoxValidationSeverity.Info,
      };
    }

    // 装飾適用
    updateDecoration(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches,
      this.matchContext_.currentMatchIndex
    );

    // マッチしている文字列先頭にカーソル移動
    moveCursor(
      this.matchContext_.searchContext.editor,
      this.matchContext_.matches[this.matchContext_.currentMatchIndex].start
    );
  }
  exit(): void {
    console.debug("SubStateWrappedBackward: exit()");
    // nop
  }

  transition(event: Event): State | undefined {
    console.debug("SubStateWrappedBackward: transaction(): Event: ", event);
    switch (event.kind) {
      case "isearchForward":
        // その場で前方検索に反転
        return new SubStateWrapped(this.matchContext_);

      case "isearchBackward": {
        if (this.matchContext_.currentMatchIndex > 0) {
          // 後方あり
          return new SubStateWrappedBackward({
            ...this.matchContext_,
            currentMatchIndex: this.matchContext_.currentMatchIndex - 1,
          });
        } else {
          // 後方無し
          return new SubStateReachedEndBackward(this.matchContext_);
        }
      }

      case "queryChanged":
        // クエリ変更
        return onQueryChangedBackward(
          this.matchContext_.searchContext,
          event.query
        );

      default:
        break;
    }
    return undefined;
  }
}

/** 前方検索中にクエリ文字列が変更された場合の処理
 *
 * @param searchContext
 * @param queryStr
 * @returns 遷移先状態
 */
const onQueryChangedForward = (
  searchContext: SearchContext,
  queryStr: string
): State => {
  {
    if (queryStr === "") {
      return new SubStateEmpty(searchContext);
    }

    // 検索
    const [matches, idx] = search(
      searchContext.context.migemo,
      searchContext.editor,
      queryStr,
      searchContext.initialSelection // TODO DELで過去のマッチ位置に戻る対応。これだと単に最初から探すだけ。
    );

    const matchContext: MatchContext = {
      searchContext,
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
};

/** 後方検索中にクエリ文字列が変更された場合の処理
 *
 * @param searchContext
 * @param queryStr
 * @returns 遷移先状態
 */
const onQueryChangedBackward = (
  searchContext: SearchContext,
  queryStr: string
): State => {
  if (queryStr === "") {
    return new SubStateEmptyBackward(searchContext);
  }

  // 検索
  const [matches, idx] = search(
    searchContext.context.migemo,
    searchContext.editor,
    queryStr,
    searchContext.initialSelection // TODO DELで過去のマッチ位置に戻る対応。これだと単に最初から探すだけ。
  );

  let i = -1;

  if (idx === -1) {
    if (matches.length > 0) {
      // マッチ範囲はあったものの、前方検索で見つからなかった -> 最後のマッチ
      i = matches.length - 1;
    } else {
      // 一つもマッチ範囲がない === -1
    }
  } else if (idx === 0) {
    // 一番先頭範囲で前方マッチ === 後方マッチしていない === -1
    // nop
  } else {
    // 途中で前方マッチ -> 後方検索なら、その一つ手前
    i = idx - 1;
  }

  const matchContext: MatchContext = {
    searchContext,
    matches,
    initialMatchIndex: i,
    currentMatchIndex: i,
  };

  if (i !== -1) {
    // 見つかった
    return new SubStateSearchingBackward(matchContext);
  } else {
    // 見つからない
    return new SubStateReachedEndBackward(matchContext);
  }
};

class SearchRing {
  // 最新: 0; 最古: length-1
  private ring_: string[] = [];
  private searchRingMax_ = 16;

  constructor(searchRingMax?: number) {
    if (searchRingMax != null) {
      this.searchRingMax_ = searchRingMax;
    }
  }

  public add(query: string): void {
    // 先頭(最新)に追加
    this.ring_.unshift(query);

    // 重複があれば後ろの方(古い方)を削除
    this.ring_ = Array.from(new Set(this.ring_));

    if (this.ring_.length > this.searchRingMax_) {
      // 長すぎる場合、末尾(最古)を削除
      this.ring_.pop();
    }
  }

  public iter(): RingIter {
    return new RingIter(this.ring_);
  }
}

class RingIter {
  // 最新: 0; 最古: length-1
  private readonly data_: string[];

  private idx_: number | undefined;

  constructor(data: string[]) {
    this.data_ = data;
  }

  public newest(): string | undefined {
    if (this.data_.length === 0) {
      return undefined;
    }
    return this.data_[0];
  }

  // 新 -> 旧 M-p isearch-ring-retreat
  public getRetreat(): string | undefined {
    if (this.data_.length === 0) {
      return undefined;
    }
    if (this.idx_ == null) {
      // 初回なら最新を返すようにする
      this.idx_ = -1;
    }

    if (this.idx_ + 1 >= this.data_.length) {
      return undefined;
    }
    this.idx_ += 1;
    return this.data_[this.idx_];
  }

  // 旧 -> 新 M-n isearch-ring-advance
  public getAdvance(): string | undefined {
    if (this.data_.length === 0) {
      return undefined;
    }

    if (this.idx_ == null) {
      // 初回なら最古を返すようにする
      this.idx_ = this.data_.length;
    }

    if (this.idx_ <= 0) {
      return undefined;
    }

    this.idx_ -= 1;
    return this.data_[this.idx_];
  }
}
