# Change Log

All notable changes to the "migemo-isearch" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.3.0] - 2023-01-07

### Added

- DEL キーでマッチ位置をさかのぼる対応
- ^G で検索キャンセル時、検索文字列から検索に失敗した文字を取り除く対応

### Fixed

- マウスクリックなどで検索終了した場合、カーソル位置を保全するよう修正

### Changed

- 検索時に大文字が含まれている場合のみ、大文字小文字を区別するように変更

## [0.2.0] - 2023-01-06

### Added

- サーチリング実装

### Fixed

- 後方検索中の Wrapped/Overwrapped の表記が間違っていたのを修正

## [0.1.1] - 2023-01-05

### Fixed

- 後方検索のマッチ位置判定が不正確だったのを修正

## [0.1.0] - 2023-01-05

- Initial release
