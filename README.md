<!-- markdownlint-disable MD033 MD013 -->

# migemo-isearch

[jsmigemo](https://github.com/oguna/jsmigemo)を利用し、ローマ字のまま日本語をインクリメンタル検索するための機能拡張です。

![migemo icon](https://raw.githubusercontent.com/sumomoneko/migemo-isearch/main/doc/searching.gif)

## そもそも migemo とは？

詳しくはオリジナル実装の高林哲さんによる解説、「[Migemo: ローマ字のまま日本語をインクリメンタル検索](http://0xcc.net/migemo/)」を参照ください。

## 設定方法

Emacs のインクリメンタルサーチの様に使う場合は、とくに設定は不要です。
デフォルトでは、以下に示すように emacs に合わせたキーボードバインディングとしています:

| コマンド                          | 説明                           | デフォルトバインド           |
| --------------------------------- | ------------------------------ | ---------------------------- |
| `migemo-isearch.isearch-forward`  | 前方インクリメンタルサーチ開始 | <kbd>ctrl</kbd>+<kbd>s</kbd> |
| `migemo-isearch.isearch-backward` | 後方インクリメンタルサーチ開始 | <kbd>ctrl</kbd>+<kbd>r</kbd> |

なお、例えば[Awesome Emacs Keymap](https://marketplace.visualstudio.com/items?itemName=tuttieee.emacs-mcx)を利用している場合、検索コマンドの競合を避けるために`keybindings.json`に以下を追加し、Awesome Emacs Keymap の設定を無効化・調整する必要があります。

```json
{
    "key": "ctrl+s",
    "command": "-emacs-mcx.isearchForward",
    "when": "!findInputFocussed"
},
{
    "key": "ctrl+r",
    "command": "-emacs-mcx.isearchBackward",
    "when": "!findInputFocussed"
},
{
    "key": "ctrl+g",
    "command": "-workbench.action.closeQuickOpen",
    "when": "inQuickOpen"
},
{
    "key": "ctrl+g",
    "command": "workbench.action.closeQuickOpen",
    "when": "inQuickOpen && !migemo-isearch.inIsearchMode"
},
{
    "key": "ctrl+n",
    "command": "-workbench.action.quickOpenSelectNext",
    "when": "inQuickOpen"
},
{
    "key": "ctrl+n",
    "command": "workbench.action.quickOpenSelectNext",
    "when": "inQuickOpen && !migemo-isearch.inIsearchMode"
},
{
    "key": "ctrl+p",
    "command": "-workbench.action.quickOpenSelectPrevious",
    "when": "inQuickOpen"
},
{
    "key": "ctrl+p",
    "command": "workbench.action.quickOpenSelectPrevious",
    "when": "inQuickOpen && !migemo-isearch.inIsearchMode"
}
```

### context

インクリメンタルサーチを開始し input box が表示されている状態では、`migemo-isearch.inIsearchMode`という[context](https://code.visualstudio.com/api/references/when-clause-contexts)が有効になっています。

なお、[Awesome Emacs Keymap](https://marketplace.visualstudio.com/items?itemName=tuttieee.emacs-mcx)がインストールされいる場合、
`migemo-isearch.isEmacsMcxInstalled`というコンテキストが有効になっています。

これらの context はキーバインド設定の`when`句に利用することができ、デフォルトで以下のキーがバインドされています。

| コマンド                                 | 説明              | デフォルトバインド           |
| ---------------------------------------- | ----------------- | ---------------------------- |
| `migemo-isearch.isearch-repeat-forward`  | 前方次検索        | <kbd>ctrl</kbd>+<kbd>s</kbd> |
| `migemo-isearch.isearch-repeat-backward` | 後方次検索        | <kbd>ctrl</kbd>+<kbd>r</kbd> |
| `migemo-isearch.isearch-delete-char`     | 検索文字削除/戻る | <kbd>backspace</kbd>         |
| `migemo-isearch.isearch-exit`            | 検索完了          | <kbd>enter</kbd>             |
| `migemo-isearch.isearch-abort`           | 検索中断          | <kbd>ctrl</kbd>+<kbd>g</kbd> |
| `migemo-isearch.isearch-ring-retreat`    | 検索履歴を遡る    | <kbd>alt</kbd>+<kbd>p</kbd>  |
| `migemo-isearch.isearch-ring-forward`    | 検索履歴を進める  | <kbd>alt</kbd>+<kbd>n</kbd>  |

## Config 項目

### `migemo-isearch.useMetaPrefixMacCmd`

true を設定した場合、オプション(<kbd>⌥</kbd>)キーの代わりにコマンド(<kbd>⌘</kbd>)キーを利用します。この設定は macOS のみ有効です。
(c.f. [emacs-mcx.useMetaPrefixMacCmd](https://github.com/whitphx/vscode-emacs-mcx#emacs-mcxusemetaprefixescape))

## 使い方

<kbd>ctrl</kbd>+<kbd>s</kbd> (`isearch-forward`) で、ファイル終端(前方)に向けたインクリメンタル検索を開始します。

<kbd>ctrl</kbd>+<kbd>r</kbd> (`isearch-backward`) で、ファイル先頭(後方)に向けたのインクリメンタル検索を開始します。

検索文字列が無い状態でもう一度 <kbd>ctrl</kbd>+<kbd>s</kbd>(または <kbd>ctrl</kbd>+<kbd>r</kbd>)をタイプすると、最後に検索した文字列の再検索を行います。

文字列の検索に成功している状態で<kbd>ctrl</kbd>+<kbd>s</kbd>(または <kbd>ctrl</kbd>+<kbd>r</kbd>)をタイプすると、タイプする毎に次(前)のマッチ位置にジャンプしていきます。
<kbd>backspace</kbd> (`isearch-delete-char`)をタイプすると、一回前の位置に戻ります。

検索を完了する毎に、検索文字列がサーチリング(search ring)に保存されます。
コマンド <kbd>alt</kbd>+<kbd>p</kbd> (`isearch-ring-retreat`)または <kbd>alt</kbd>+<kbd>n</kbd> (`isearch-ring-advance`)で、リング内の文字列を呼び出すことが出来ます。

サーチリングの中に保存されている過去の検索文字列の数は、現在のところ固定で 16 です。

検索文字列は大文字小文字を区別しません。ただし、検索文字列に大文字が含まれていると、大文字・小文字を区別するようになります。

なお migemo で熟語・複合語を検索する場合、例えば"漢字入力"をマッチしたい場合には、"kanjiNyuuryoku"というように区切りを大文字にします。
このときアルファベットの大文字小文字が区別されるようになりますが、実用上問題ないかと思います。

<kbd>enter</kbd>(`isearch-exit`)をタイプすると検索を終了します。あるいは、
<kbd>left</kbd>/<kbd>right</kbd>/<kbd>up</kbd>/<kbd>down</kbd>/<kbd>home</kbd>/<kbd>end</kbd>/
<kbd>pagedown</kbd>/<kbd>pageup</kbd>のいずれかをタイプすると検索を終了し、続いてタイプしたコマンドを実行します。

[Awesome Emacs Keymap](https://marketplace.visualstudio.com/items?itemName=tuttieee.emacs-mcx)がインストールされている場合は、以下のキーをタイプしても検索を終了し、続いて定義されているコマンドを実行します。

<details>
  <summary>詳細</summary>

- <kbd>ctrl</kbd>+<kbd>f</kbd>
- <kbd>ctrl</kbd>+<kbd>b</kbd>
- <kbd>ctrl</kbd>+<kbd>p</kbd>
- <kbd>ctrl</kbd>+<kbd>n</kbd>
- <kbd>ctrl</kbd>+<kbd>a</kbd>
- <kbd>ctrl</kbd>+<kbd>e</kbd>
- <kbd>alt</kbd>+<kbd>f</kbd>
- <kbd>alt</kbd>+<kbd>b</kbd>
- <kbd>alt</kbd>+<kbd>m</kbd>
- <kbd>ctrl</kbd>+<kbd>v</kbd>
- <kbd>alt</kbd>+<kbd>v</kbd>
- <kbd>alt</kbd>+<kbd>shift</kbd>+<kbd>.</kbd>
- <kbd>alt</kbd>+<kbd>shift</kbd>+<kbd>,</kbd>
- <kbd>alt</kbd>+<kbd>g</kbd> <kbd>alt</kbd>+<kbd>g</kbd>
- <kbd>alt</kbd>+<kbd>g</kbd> <kbd>g</kbd>
- <kbd>ctrl</kbd>+<kbd>x</kbd> <kbd>ctrl</kbd>+<kbd>o</kbd>
- <kbd>ctrl</kbd>+<kbd>x</kbd> <kbd>h</kbd>
- <kbd>ctrl</kbd>+<kbd>x</kbd> <kbd>u</kbd>
- <kbd>ctrl</kbd>+<kbd>/</kbd>
- <kbd>ctrl</kbd>+<kbd>shift</kbd>+<kbd>-</kbd>
- <kbd>ctrl</kbd>+<kbd>;</kbd>
- <kbd>alt</kbd>+<kbd>;</kbd>
- <kbd>ctrl</kbd>+<kbd>w</kbd>
- <kbd>alt</kbd>+<kbd>w</kbd>
- <kbd>ctrl</kbd>+<kbd>y</kbd>
- <kbd>alt</kbd>+<kbd>y</kbd>
- <kbd>ctrl</kbd>+<kbd>o</kbd>
- <kbd>ctrl</kbd>+<kbd>m</kbd>
- <kbd>ctrl</kbd>+<kbd>j</kbd>

</details><br>

検索を中断する場合は<kbd>ctrl</kbd>+<kbd>g</kbd> (`isearch-abort`) をタイプしますが、その動作は状況に依存します:

1. 文字列の検索に成功している状態で<kbd>ctrl</kbd>+<kbd>g</kbd>をタイプすると、検索全体が取り消されカーソルが検索開始した位置に戻ります。
2. 検索に成功していた後に続いて失敗した文字が含まれている状態で<kbd>ctrl</kbd>+<kbd>g</kbd>をタイプすると、検索に失敗した文字列が取り除かれ、
   最後に成功した位置に戻ります。  
   この状態で 2 回目の<kbd>ctrl</kbd>+<kbd>g</kbd>をタイプすると、1.の処理となって検索全体が取り消されます。

## ToDo

今後予定しているのは以下の通りです:

- isearch-yank-\* など
- query-replace への移行機能
- 大文字小文字区別の切り替え機能
- [ace-jump-mode](http://emacs.rubikitch.com/ace-isearch/)との統合

## 参考

- [GNU Emacs Manual(Japanese Translation): Incremental Search](https://ayatakesi.github.io/emacs/24.5/Incremental-Search.html#Incremental-Search)
- [VSCode のキーバインド拡張を作ったので、その勘所を紹介 - Qiita](https://qiita.com/whitphx/items/af8baa19fc4280ac1c0a)

## 謝辞およびライセンス

migemo のオリジナル実装は、高林哲さんによる [Migemo: ローマ字のまま日本語をインクリメンタル検索](http://0xcc.net/migemo/)です。

本機能拡張は、oguna さんによる javascript の migemo 実装、[oguna/jsmigemo](https://github.com/oguna/jsmigemo)を利用しています。
また辞書として、3 条項 BSD ライセンスに基づいた[oguna/yet-another-migemo-dict](https://github.com/oguna/yet-another-migemo-dict)を利用しています。  
これら oguna さんの実装は、[辞書構造を工夫した Migemo 実装の紹介 - Qiita](https://qiita.com/oguna/items/c70e8c409b663d74113e)で詳しく説明されています。

### アイコンについて

![migemo icon](https://raw.githubusercontent.com/sumomoneko/migemo-isearch/main/images/migemo.png)

機能拡張のアイコンは、[名前の由来](http://0xcc.net/unimag/2/#label-23)に基づきちょんまげ(?)の生えたポケモンを
[text-to-pokemon](https://replicate.com/lambdal/text-to-pokemon)で生成、利用しています。  
その学習データには[pokemon-blip-captions](https://huggingface.co/datasets/lambdalabs/pokemon-blip-captions)が使われており、
ライセンスは[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ja)とのことです。

しかし 2023 年現在、AI が生成した画像の著作権についてはまだ曖昧な点があると理解しています。
以上を踏まえ、このアイコンについて私 sumomoneko は一切の権利主張を行いません。
