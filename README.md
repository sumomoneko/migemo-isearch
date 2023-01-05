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
}
```

インクリメンタルサーチを開始し input box が表示されている状態では、`migemo-isearch.inIsearchMode`という[context](https://code.visualstudio.com/api/references/when-clause-contexts)が有効になっています。

この context はキーバインド設定の`when`句に利用することができ、デフォルトで以下のキーがバインドされています。

| コマンド                          | 説明       | デフォルトバインド |
| --------------------------------- | ---------- | ------------------ |
| `migemo-isearch.isearch-forward`  | 前方次検索 | ctrl+s             |
| `migemo-isearch.isearch-backward` | 後方次検索 | ctrl+r             |
| `migemo-isearch.cancel`           | 検索中断   | ctrl+g             |

## ToDo

現在の所、基本的なインクリメンタルサーチしか対応していません。今後予定しているのは以下の通りです:

- サーチリング(search ring)対応
- DEL 時の戻り方変更( s.a. [key bindings - How to make DEL in isearch always delete character? - Emacs Stack Exchange](https://emacs.stackexchange.com/questions/34069/how-to-make-del-in-isearch-always-delete-character))
- 文字列が見つからなかった場合の `ctrl-g`の挙動
- isearch-yank-kill などの挙動
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
