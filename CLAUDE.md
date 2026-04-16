# こてらん家のお金 - 家計簿LINE BOT

## プロジェクト概要
夫婦2人（かず・もも）で使うLINE家計簿BOT。
GAS（バックエンド）+ HTML（フロントエンド/Vercel）構成。

## リポジトリ構成

## スプレッドシート構成
シートID: スクリプトプロパティ `SPREADSHEET_ID` で管理

### 支出ログシート（メインデータ）
| 列 | 内容 |
|----|------|
| A (r[0]) | 日付 (Date型) |
| B (r[1]) | カテゴリ（食費/交通/交際/日用品/娯楽/その他/収入/支給） |
| C (r[2]) | サブカテゴリ |
| D (r[3]) | 金額（支出は正数、支給は負数） |
| E (r[4]) | 入力元（LINE / LIFF / 固定費） |
| F (r[5]) | メモ |
| G (r[6]) | LINE UID |

### 固定費マスタシート
| 列 | 内容 |
|----|------|
| A (r[0]) | 名前 |
| B (r[1]) | カテゴリ |
| C (r[2]) | 金額 |
| D (r[3]) | 記録日（毎月何日か） |
| E (r[4]) | 有効フラグ（TRUE/FALSE） |

### 予算設定シート
| 列 | 内容 |
|----|------|
| A | LINE UID |
| B | カテゴリ |
| C | 予算金額 |

## スクリプトプロパティ（環境変数）
- `SPREADSHEET_ID` : スプレッドシートID
- `LINE_ACCESS_TOKEN` : LINEチャネルアクセストークン
- `MY_UID` : かずのLINE UID
- `WIFE_UID` : もものLINE UID

## 主要関数一覧
- `doGet(e)` : Web App GETエンドポイント（getReport / getBalance / getFixedCosts / deleteRecord / editRecord）
- `doPost(e)` : Webhook + POSTエンドポイント（formAdd / addFixedCost / editFixedCost / deleteFixedCost）
- `handleEvent(ev)` : LINEメッセージルーター
- `parseSmartInput(text)` : 自然言語パーサ（「600 セコマ」→金額+カテゴリ）
- `sendDailyReport()` : 毎日21時トリガー（日次振り返り通知）
- `recordFixedCosts()` : 毎日トリガー（固定費自動記録）
- `handleBalance(uid, replyToken)` : 残額計算・返信

## カテゴリ一覧
食費 / 交通 / 交際 / 日用品 / 娯楽 / その他
※ 特殊: 収入 / 支給（支出集計から除外）

## GAS改修後のデプロイ手順
1. `cd ~/form/gas`
2. `clasp push` でGASに反映
3. GASエディタで「デプロイ→既存のデプロイを管理→新しいバージョン」で再デプロイ
4. WebhookURLは変わらないのでLINE側の設定変更不要

## 注意事項
- GASはclasp経由でローカル編集 → `clasp push` で反映
- フロントエンド（index.html / report.html）はgit push → Vercel自動デプロイ
- スクリプトプロパティは絶対にコードに直書きしない

## 開発スタイル（重要）

私は非エンジニアのため、以下のスタイルで進めること。

### 実装の進め方
1. まず「何をどう変えるか」を日本語で簡単に説明する
2. 説明にOKもらってからコードを書く
3. 実装後は自分でレビューして問題があれば修正まで行う
4. 完了したら「次にやること（clasp pushなど）」を一言で伝える

### 説明のルール
- 技術用語はなるべく使わない
- 使う場合は必ず日本語で補足する
- 変更箇所は「どのファイルの何行目あたり」と教える

### コードのルール
- 関数には必ず日本語コメントを書く
- 変更箇所には「// ここから追加」「// ここまで追加」のコメントをつける
- 作業が完了したら最後に「✅ 完了」と必ず書く
- 次にやることがあれば「👉 次のステップ：〇〇」と書く
