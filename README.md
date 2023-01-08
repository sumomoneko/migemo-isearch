# migemo-isearch

[jsmigemo](https://github.com/oguna/jsmigemo)を利用し、ローマ字のまま日本語をインクリメンタル検索するための機能拡張です。

![migemo icon](https://raw.githubusercontent.com/sumomoneko/migemo-isearch/main/doc/searching.gif)

## そもそも migemo とは？

詳しくはオリジナル実装の高林哲さんによる解説、「[Migemo: ローマ字のまま日本語をインクリメンタル検索](http://0xcc.net/migemo/)」を参照ください。

## 設定方法

デフォルトでは、以下に示すように、emacs に合わせたキーボードバインディングとしています:

| コマンド                          | 説明                           | デフォルトバインド |
| --------------------------------- | ------------------------------ | ------------------ |
| `migemo-isearch.isearch-forward`  | 前方インクリメンタルサーチ開始 | ctrl+s             |
| `migemo-isearch.isearch-backward` | 後方インクリメンタルサーチ開始 | ctrl+r             |

なお、例えば[Awesome Emacs Keymap](https://marketplace.visualstudio.com/items?itemName=tuttieee.emacs-mcx)を利用している場合、検索コマンドの競合を避けるために`keybindings.json`に以下を追加し、Awesome Emacs Keymap の設定を無効化する必要があります。

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
}
```

インクリメンタルサーチを開始し input box が表示されている状態では、`migemo-isearch.inIsearchMode`という[context](https://code.visualstudio.com/api/references/when-clause-contexts)が有効になっています。

この context はキーバインド設定の`when`句に利用することができ、デフォルトで以下のキーがバインドされています。

| コマンド                              | 説明              | デフォルトバインド |
| ------------------------------------- | ----------------- | ------------------ |
| `migemo-isearch.isearch-forward`      | 前方次検索        | ctrl+s             |
| `migemo-isearch.isearch-backward`     | 後方次検索        | ctrl+r             |
| `migemo-isearch.isearch-delete-char`  | 検索文字削除/戻る | backspace          |
| `migemo-isearch.isearch-abort`        | 検索中断          | ctrl+g             |
| `migemo-isearch.isearch-ring-retreat` | 検索履歴を遡る    | alt+p              |
| `migemo-isearch.isearch-ring-forward` | 検索履歴を進める  | alt+n              |

## 設定項目

### `migemo-isearch.useMetaPrefixMacCmd`

true を設定した場合、オプション(⌥)キーの代わりにコマンド(⌘)キーを利用します。この設定は macOS のみ有効です。
(c.f. [emacs-mcx.useMetaPrefixMacCmd](https://github.com/whitphx/vscode-emacs-mcx#emacs-mcxusemetaprefixescape))

## 使い方

ctrl+s で、ファイル終端(前方)に向けたインクリメンタル検索を開始します(isearch-forward)。
ctrl-r で、ファイル先頭(後方)に向けたのインクリメンタル検索を開始します(isearch-backward)。

検索文字列が無い状態でもう一度 ctrl+s(または ctrl+r)をタイプすると、最後に検索した文字列の再検索を行います。

文字列の検索に成功している状態で、ctrl+s(または ctrl+r)をタイプすると、次(前)のマッチ位置にジャンプしていきます。
この操作は何度でも繰り返すことで、次々にジャンプしていくことが出来ます。`backspace`(`migemo-isearch.isearch-delete-char`)をタイプすると、ジャンプを 1 回取り消します。

以前に検索した文字列を再利用するには、サーチリング(search ring)を使います。
コマンド alt+p (isearch-ring-retreat)または alt+n (isearch-ring-advance)で、リングを移動して再使用したい文字列を取り出します。

サーチリングの中に保存されている最近使用された検索文字列の数は、現在のところ固定で 16 です。

検索文字列は大文字小文字を区別しません。ただし、検索文字列に大文字が含まれていると、大文字・小文字を区別するようになります。

なお migemo で熟語・複合語を検索する場合、例えば"漢字入力"をマッチしたい場合、"kanjiNyuuryoku"というように区切りを大文字にします。
このときアルファベットの大文字小文字が区別されるようになりますが、実用上問題ないかと思います。

検索中断のコマンド `migemo-isearch.isearch-abort` の動作は、多少複雑です:

1. 文字列の検索に成功している状態で`migemo-isearch.isearch-abort`をタイプすると、検索全体が取り消され、カーソルが検索開始した位置に戻ります。
2. 検索に成功していた後に続いて失敗した文字が含まれている状態で`migemo-isearch.isearch-abort`をタイプすると、検索に失敗した文字列が取り除かれ、
   最後に成功した位置に戻ります。  
   この状態で 2 回目の`migemo-isearch.isearch-abort`をタイプすると、1.の処理となって検索全体が取り消されます。

## ToDo

現在の所、基本的なインクリメンタルサーチしか対応していません。今後予定しているのは以下の通りです:

- isearch-yank-kill などの挙動
- 大文字小文字の処理切り替えなど
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
