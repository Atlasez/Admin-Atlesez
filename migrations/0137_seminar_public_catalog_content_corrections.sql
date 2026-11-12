-- Corrections verified against the individual public pages on
-- https://sites.google.com/view/atlasez-semi (2026-11-12).
-- Preserve existing editor notes when this migration is applied more than once.
UPDATE seminars
SET details = json_set(
  details,
  '$.remarks',
  CASE number
    WHEN 31 THEN '他人を傷つけたり、差別的な発言をする方の参加は断固お断りさせていただきます。' || char(10) || '「差別をしない」というのは人として当たり前のことであり、普遍的な理念です。'
    WHEN 29 THEN '9版と10版で多少数値にブレがある。しかし、0.1とかの些細な違いなのでこの違いの意図まではよく分からなかった。'
    WHEN 16 THEN '場の量子論についてのゼミです。洋書アレルギーの方以外であれば歓迎です。' || char(10) || '詳細は、逐次以下リンクよりアップデートされます。' || char(10) || 'https://docs.google.com/document/d/1oC5vn6lWZ5_S2tFY8tsbUfJQM68vjwK-WhLmSHwPvNg/edit?usp=sharing'
    WHEN 15 THEN '元サイトでは開催頻度欄に「火曜6限」、開催日時欄に「水3(13:00-14:30)」と記載されています。日程は主催者にご確認ください。'
    WHEN 10 THEN '6/20時点で§8の中盤です。'
    WHEN 8 THEN '現在の進行状況としては、まだ数学的準備のフェーズです。ラグランジアンも出てきてません。'
    WHEN 5 THEN 'かなり進んでいて、上巻の半分以上は終わりました。これから超関数を導入していく感じです。'
    WHEN 3 THEN '元サイトの一覧では「募集終了」、個別ページでは「募集中」と記載されています。募集状況は一覧に合わせて「募集終了」としています。'
    WHEN 2 THEN '元サイトの一覧では「募集終了」、個別ページでは「募集中」と記載されています。募集状況は一覧に合わせて「募集終了」としています。'
  END
)
WHERE number IN (31, 29, 16, 15, 10, 8, 5, 3, 2)
  AND proposal_status = 'approved'
  AND source_url IS NOT NULL
  AND COALESCE(json_extract(details, '$.remarks'), '') = '';

-- Migration 0135 stored these two long descriptions as a 200-character excerpt.
-- Replace only that exact imported excerpt so later edits remain untouched.
UPDATE seminars
SET details = json_set(
  details,
  '$.description',
  CASE number
    WHEN 31 THEN '昨今、世界中で排外主義的ポピュリズムの隆盛が目立ちます。我々大学生といった未来を担う世代にとってこれは決して看過できない状況である一方で、我々自身このような状況をどのように理解すればいいのか、戸惑うところがあることも事実です。' || char(10) || 'しかし、それは一つには我々自身に知識が不足しているところが大きく、このような情勢を深く理解しようと思えば、まずはこうした問題に誰よりも向き合い、知見を積み上げてきた研究者たちに学ぶのが一番です。また、過去の歴史に学ぶことも多いに有益でしょう。安易なアナロジーは危険なものの、例えばヴァイマル共和政がいかに崩壊してしまったのかを学ぶことは我々に多くの示唆を与えてくれるでしょう。我々は謙虚にもっと学ぶべきなのです。' || char(10) || 'しかし、各自別々の専門の勉強で忙しい以上、収集できる情報にも限りがあり、専門外の勉強に割けるリソースも限られています。また学科内で現在の情勢について真剣に話す機会が残念ながら少ないことも事実でしょう。' || char(10) || 'そこで本読書会では主に歴史や政治学を専門に学んでいるわけではない人を対象に（もちろんこれらが専門の方も大歓迎です！）、各人が興味のある本を持ち寄って各々読書を進め、気になったことを議論するということを行いたいと思っています。' || char(10) || '明確な目標があるわけではありませんが、この読書会を通じて現在の国内・国際情勢をよりよく理解すること、また建設的な議論をする力の増進を目指します。' || char(10) || '現在の国内・国際情勢についてより深く理解したい、他人と建設的に現在の政治について議論したいという方なら誰でも大歓迎です。' || char(10) || '実際主催者は現在東京大学理学部物理学科3年の学生です。主催者自身は近現代ドイツの歴史・政治に非常に強い関心があります。'
    WHEN 17 THEN '固定された数の粒子のダイナミクスを記述する量子力学はある一つのHilbert空間によって記述されますが、場の量子論に移行し粒子の生成消滅を考えるようになると、それでは不十分でFock空間を考える必要が出てきます。' || char(10) || '本ゼミでは、単一のHIlbert空間やそれ上の線形作用素を扱う関数解析学から一歩進んで、Fock空間の数学的取り扱いを学び、場の量子論を数学的に厳密な形で理解することを目標にしています。' || char(10) || '場の量子論の前提知識があれば望ましいですが、必ずしも必要ではありません。' || char(10) || '実際言い出しっぺは、場の量子論を勉強中の初学者です。'
  END
)
WHERE proposal_status = 'approved'
  AND source_url IS NOT NULL
  AND (
    (number = 31 AND json_extract(details, '$.description') = '昨今、世界中で排外主義的ポピュリズムの隆盛が目立ちます。我々大学生といった未来を担う世代にとってこれは決して看過できない状況である一方で、我々自身このような状況をどのように理解すればいいのか、戸惑うところがあることも事実です。' || char(10) || 'しかし、それは一つには我々自身に知識が不足しているところが大きく、このような情勢を深く理解しようと思えば、まずはこうした問題に誰よりも向き合い、知見を積み上げてきた研究者…')
    OR (number = 17 AND json_extract(details, '$.description') = '固定された数の粒子のダイナミクスを記述する量子力学はある一つのHilbert空間によって記述されますが、場の量子論に移行し粒子の生成消滅を考えるようになると、それでは不十分でFock空間を考える必要が出てきます。' || char(10) || '本ゼミでは、単一のHIlbert空間やそれ上の線形作用素を扱う関数解析学から一歩進んで、Fock空間の数学的取り扱いを学び、場の量子論を数学的に厳密な形で理解することを目標にしています…')
  );

-- The #20 entry is explicitly about fluid mechanics: its title, book, and
-- description agree, while the imported theme was copied from quantum chemistry.
UPDATE seminars
SET details = json_set(details, '$.theme', '流体力学')
WHERE number = 20
  AND title = '流体力学ゼミ'
  AND proposal_status = 'approved'
  AND source_url LIKE '%0000020-%'
  AND json_extract(details, '$.theme') = '量子化学ゼミ';
