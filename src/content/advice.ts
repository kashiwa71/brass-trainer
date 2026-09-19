/**
 * プロ奏者・指導者のアドバイス集。練習画面で状況に応じて表示し、出典へのリンクを示す。
 * すべて実際に公開されているページから要約・短い引用をしている。追加するときは出典 URL を必ず付けること。
 */

export type Topic = "ear" | "pitch-accuracy" | "attack" | "lip-slur" | "tonguing" | "general";

/** 練習中に起きた出来事。これに合わせてアドバイスを選ぶ */
export type Trigger =
  | "before-start"
  | "missed-below"
  | "missed-above"
  | "sing-off"
  | "scoop"
  | "from-above"
  | "glitch"
  | "slow-rise"
  | "unstable"
  | "slur-extra"
  | "slur-missing"
  | "slur-gap"
  | "tonguing-few"
  | "tonguing-many"
  | "tonguing-uneven"
  | "tonguing-off"
  | "drone-sharp"
  | "drone-flat"
  | "drone-wobbly";

export interface Advice {
  id: string;
  topics: Topic[];
  triggers: Trigger[];
  /** 見出し（大きく表示） */
  title: string;
  /** 練習中に一目で読める一言 */
  cue: string;
  /** 2〜3 文の説明 */
  detail: string;
  /** 出典からの短い引用（原文のまま） */
  quote?: string;
  source: { title: string; author: string; url: string; lang: "ja" | "en" };
}

export const ADVICE: Advice[] = [
  {
    id: "jacobs-hear-first",
    topics: ["ear", "pitch-accuracy", "attack"],
    triggers: ["before-start", "missed-below", "missed-above", "glitch"],
    title: "吹く前に、頭の中で鳴らす",
    cue: "先に頭の中で音を鳴らしてから吹く",
    detail:
      "シカゴ交響楽団のチューバ奏者だったアーノルド・ジェイコブスの中心的な教えです。楽器は自分で音を選べないので、出したい音を先に心の中で歌い、それを唇で真似る。音を外す一番の原因は「どの音か決めずに吹くこと」です。",
    quote: "Hear the sound in your head and then duplicate it on your instrument.",
    source: {
      title: "Brief Teachings of Arnold Jacobs（dwerden.com フォーラム）",
      author: "Arnold Jacobs の教えの紹介",
      url: "https://forum.dwerden.com/forum/euphonium-tuba-and-general-music/general-music-discussion/performance-practice-tips-advice/10052-brief-teachings-of-arnold-jacobs",
      lang: "en",
    },
  },
  {
    id: "jacobs-sing-with-lips",
    topics: ["ear", "pitch-accuracy"],
    triggers: ["missed-below", "missed-above", "sing-off"],
    title: "唇を声帯だと思って歌う",
    cue: "唇をコントロールせず、頭の中の音を真似る",
    detail:
      "唇の形や力加減を操作しようとするほど当たらなくなります。ジェイコブスは「唇で歌う」と表現しました。声で歌えた音は、唇でも歌えます。",
    quote: "If you treat the embouchure as vocal cords and sing with them it's simple.",
    source: {
      title: "Brief Teachings of Arnold Jacobs（dwerden.com フォーラム）",
      author: "Arnold Jacobs の教えの紹介",
      url: "https://forum.dwerden.com/forum/euphonium-tuba-and-general-music/general-music-discussion/performance-practice-tips-advice/10052-brief-teachings-of-arnold-jacobs",
      lang: "en",
    },
  },
  {
    id: "sing-buzz-play",
    topics: ["ear", "pitch-accuracy"],
    triggers: ["before-start", "sing-off", "missed-below", "missed-above"],
    title: "歌う → バズ → 吹く の順番",
    cue: "歌えない音は吹けない。まず声で当てる",
    detail:
      "金管指導で広く使われる順番です。声で歌えるかどうかで「その音を聴けているか」が分かります。マウスピースだけのバズは声と同じで、倍音の助けがないので耳が鍛えられます。このアプリの「歌ってから吹く」はこの手順そのものです。",
    quote: "Inaccurate buzzing will produce inaccurate playing. Singing reflects what a student audiates, so teachers should ensure students have the ability to sing everything they are asked to play.",
    source: {
      title: "Sing, Buzz, Play | Brass Pedagogy（James Madison University）",
      author: "Brass Pedagogy ブログ",
      url: "https://sites.lib.jmu.edu/brasspedagogy/2016/05/31/sing-buzz-play/",
      lang: "en",
    },
  },
  {
    id: "dunham-buzz-it",
    topics: ["pitch-accuracy", "ear"],
    triggers: ["missed-below", "missed-above", "glitch"],
    title: "バズで当たる音は、楽器でも当たる",
    cue: "外す音はマウスピースだけで当てる練習をする",
    detail:
      "チューバ奏者・指導者の David Dunham は、ピアノの音とマウスピースのバズを合わせる練習や、吹いた後にバズしてすぐまた吹く「Play-Buzz-Play」を勧めています。バズで当てられない音は、楽器でも外すか、当たっても濁ります。",
    quote: "If you can buzz it, you can play it. If you cannot buzz it, then you cannot play it.",
    source: {
      title: "Tips for Better Tuba Playing – The Instrumentalist",
      author: "David Dunham",
      url: "https://theinstrumentalist.com/february-2020/tips-for-better-tuba-playing/",
      lang: "en",
    },
  },
  {
    id: "dunham-random-intervals",
    topics: ["pitch-accuracy"],
    triggers: ["before-start", "missed-below", "missed-above"],
    title: "5 度以内のランダムな跳躍を、休符つきで",
    cue: "2 分音符＋休符で、外さず 3 回続けてから次へ",
    detail:
      "Dunham の音当て練習です。完全 5 度以内のランダムな音程を、2 分音符のあとに休符を置いて吹きます。休符のあいだに次の音を頭で鳴らす時間を作り、3 回連続で外さなかったら次に進みます。このアプリの「ランダム跳躍」モードはこの練習を自動化したものです。",
    source: {
      title: "Tips for Better Tuba Playing – The Instrumentalist",
      author: "David Dunham",
      url: "https://theinstrumentalist.com/february-2020/tips-for-better-tuba-playing/",
      lang: "en",
    },
  },
  {
    id: "dunham-higher-lower-same",
    topics: ["attack", "pitch-accuracy"],
    triggers: ["glitch", "missed-below", "missed-above"],
    title: "次の音は「上か、下か、同じか」",
    cue: "吹く直前に、次の音が上か下か同じかを決める",
    detail:
      "ブレスのあとに音が割れる原因は、次の音の高さを決めずに口を当てることです。Dunham は、吹く直前に次の音が今より高いか低いか同じかに集中するだけで、割れる回数が減ると述べています。",
    source: {
      title: "Tips for Better Tuba Playing – The Instrumentalist",
      author: "David Dunham",
      url: "https://theinstrumentalist.com/february-2020/tips-for-better-tuba-playing/",
      lang: "en",
    },
  },
  {
    id: "gonza-decide-buzz-moment",
    topics: ["attack"],
    triggers: ["before-start", "slow-rise", "unstable", "scoop"],
    title: "「ここから唇を震わせる」と決めて吹く",
    cue: "テンポに合わせてバズィングの瞬間を「ここ」と決める",
    detail:
      "ホルン奏者・指導者のごんざゆういち氏の記事です。「もっと息をしっかり」ではなく、唇が振動し始める瞬間を自分で決めて吹くと、輪郭のはっきりした立ち上がりになります。出だしがぼやける人は、振動の開始が受け身になっています。",
    quote: "テンポに合わせてバズィングの瞬間を『ここ』と決めて吹くと、輪郭のハッキリした立ち上がりのいい音が出た",
    source: {
      title: "音の出だし（アタック）が苦手だったら、バズィングするタイミングを決めてから吹いてみよう | GONLOG",
      author: "ごんざゆういち",
      url: "https://gonzayuichi.com/dedainigateyanen",
      lang: "ja",
    },
  },
  {
    id: "kazz-air-attack",
    topics: ["attack", "lip-slur"],
    triggers: ["before-start", "slow-rise", "slur-missing", "slur-gap"],
    title: "楽器なしで、息だけで吹く（エアー・アタック）",
    cue: "息の量は最大、音価は守る、スラー先の音にも息を入れ直す",
    detail:
      "音楽家 Kazz（河野一之）氏が「見逃しがちな練習」として挙げる方法です。楽譜を楽器なしで息だけで吹きます。息の量はろうそくを消せる程度では意味がなく、楽器のときの数倍。音の長さを正確に守り、スラーの先の音でも「ふぅー！うー！」と息を入れ直します。管の長いチューバほど効きます。",
    quote: "蝋燭の火も消せないような少ない息の量でやっても何の意味もありません",
    source: {
      title: "【金管楽器】見逃しがちな練習3選③｜音楽家 Kazz",
      author: "河野一之（Kazz）",
      url: "https://note.com/bassjunkie/n/nd1ff4a33ff65",
      lang: "ja",
    },
  },
  {
    id: "kazz-lipslur-chromatic",
    topics: ["lip-slur"],
    triggers: ["slur-missing", "slur-extra", "before-start"],
    title: "大きな跳躍は、半音階で埋めてから",
    cue: "隣の倍音まで半音階で上り下り。3 回の間は息を吸わない",
    detail:
      "Kazz 氏のリップスラーの記事です。息の速さが唇の振動数を決めるので、口の中の広さ・舌・横隔膜で息の速さを変えます。オクターブなど大きな跳躍は、まず隣の倍音まで半音階でゆっくり上り下りし、3 回繰り返す間は息を吸わずアンブシュアを変える機会を与えないこと。頭の中で歌いながら吹きます。",
    quote: "頭の中で演奏している音をイメージ＝歌いながら演奏する",
    source: {
      title: "高い音、低い音の充実へ通ずるリップスラーの話｜音楽家 Kazz",
      author: "河野一之（Kazz）",
      url: "https://note.com/bassjunkie/n/n3ddbb3259294",
      lang: "ja",
    },
  },
  {
    id: "ogura-keep-o",
    topics: ["lip-slur"],
    triggers: ["slur-extra", "slur-gap"],
    title: "上がるときも「オ」の形を保つ",
    cue: "口の中を狭くして「イ」にしない。「オ」のまま息を速く",
    detail:
      "東京佼成ウインドオーケストラの小倉貞行氏の回答です。リップスラーで上がるときに雑音が入るのは、口の中を狭くして「イ」の形になっているから。音色が悪くなりノイズが出ます。特別な発音は要らず、「オ」の形を保ち、マウスピースで音程を取れるように練習することを勧めています。",
    quote: "シラブルの『イ』になると音色が悪くなりノイズが入ります。『オ』の形を保つようにして下さい",
    source: {
      title: "テューバ Q&A（東京佼成ウインドオーケストラ）リップスラーの雑音",
      author: "小倉貞行",
      url: "https://www.tkwo.jp/qa/tuba/tuba303.html",
      lang: "ja",
    },
  },
  {
    id: "ogura-slur-eighths",
    topics: ["lip-slur", "pitch-accuracy"],
    triggers: ["slur-missing", "missed-below", "glitch"],
    title: "引っかかる音は、8 分音符のスラーで往復する",
    cue: "引っかかる 2 音を 8 分音符でスラー、何度も往復",
    detail:
      "開放から長い管の音へ上がるときに詰まる、という質問への小倉貞行氏の回答です。その 2 音（例: B♭ と C、F と F♯）を 8 分音符くらいの速さでスラーし、繰り返すこと。特定の音で引っかかる人にそのまま使えます。",
    quote: "この音やFからF＃やG、などを８分音符くらいでスラーの練習を繰り返しすることです",
    source: {
      title: "テューバ Q&A（東京佼成ウインドオーケストラ）B♭ から C で引っかかる",
      author: "小倉貞行",
      url: "https://www.tkwo.jp/qa/tuba/tuba304.html",
      lang: "ja",
    },
  },
  {
    id: "ogura-taka",
    topics: ["tonguing"],
    triggers: ["tonguing-few", "tonguing-uneven", "before-start"],
    title: "ダブルタンギングは「タカタカ」",
    cue: "「トゥクトゥク」ではなく「タカタカ」。息を止めない",
    detail:
      "ダブルタンギングで音が掠れるという質問への小倉貞行氏の回答です。「tuku tuku」だと息が止まって音がはっきりしません。「taka taka」と発音すること。いろいろな練習を試し、自分に必要なものだけに絞るようにとも述べています。",
    quote: "tuku tukuという発音でダブルタンギングをすると息が止まるため音がはっきりしません",
    source: {
      title: "テューバ Q&A（東京佼成ウインドオーケストラ）ダブルタンギングで音が掠れる",
      author: "小倉貞行",
      url: "https://www.tkwo.jp/qa/tuba/tuba328.html",
      lang: "ja",
    },
  },
  {
    id: "ogura-jaw-not-throat",
    topics: ["tonguing", "attack"],
    triggers: ["unstable", "tonguing-uneven", "glitch"],
    title: "喉ではなく、顎を少し下げて口の中を広く",
    cue: "喉を下げようとしない。顎を少し下げる",
    detail:
      "低音のタンギングで音が不安定になる質問への小倉貞行氏の回答です。喉を下げる意識は逆効果で、顎を少し下げて口の中を広くする感じにすること。そのうえで、タンギング・スラー・ロングトーンを毎日続けるしかない、と述べています。",
    quote: "喉ではなく顎を少し下げて口の中を広くする感じ",
    source: {
      title: "テューバ Q&A（東京佼成ウインドオーケストラ）低音域のタンギング",
      author: "小倉貞行",
      url: "https://www.tkwo.jp/qa/tuba/tuba306.html",
      lang: "ja",
    },
  },
  {
    id: "ogura-buzz-not-perfect",
    topics: ["ear", "general"],
    triggers: ["sing-off"],
    title: "マウスピースのバズが鳴らなくても大丈夫",
    cue: "バズが苦手でも気にしない。楽器の音で判断する",
    detail:
      "マウスピースが上手く鳴らないという質問に、小倉貞行氏は「私もうまく鳴らせません」と答え、楽器全体の音質に意識を向けるよう勧めています。バズが苦手な人は、声で歌う練習を優先して構いません。",
    quote: "マウスピースのバズィングがうまく鳴らなくても問題ありません。私もうまく鳴らせません。",
    source: {
      title: "テューバ Q&A（東京佼成ウインドオーケストラ）マウスピースが鳴らない",
      author: "小倉貞行",
      url: "https://www.tkwo.jp/qa/tuba/tuba330.html",
      lang: "ja",
    },
  },
  {
    id: "shimamura-lipslur-basics",
    topics: ["lip-slur"],
    triggers: ["before-start", "slur-gap"],
    title: "指はそのまま、舌は突かない、息の速さと舌の位置で",
    cue: "♩=60 から。できたら 8 分 → 3 連 → 16 分",
    detail:
      "島村楽器の金管基礎練の記事です。リップスラーの要素は「指はそのまま」「舌は突かない」「息のスピードと舌の位置（口の中）を変える」の 3 つ。テンポは ♩=60 のゆっくりから始め、できたら 8 分音符、3 連符、16 分音符と細かくし、それから音域を広げます。",
    source: {
      title: "【金管楽器基礎練】毎日続けたい！リップスラーの練習｜島村楽器 名古屋則武新町店",
      author: "島村楽器",
      url: "https://www.shimamura.co.jp/update/shops/nagoyanoritake/winds/74648/",
      lang: "ja",
    },
  },
  {
    id: "positive-crescendo-up",
    topics: ["lip-slur"],
    triggers: ["slur-missing", "slur-extra"],
    title: "上がるときはクレシェンド、下がるときはデクレシェンド",
    cue: "上行はクレシェンドで息を増やす",
    detail:
      "金管指導者のブログです。リップスラーが苦手な場合は息の量に問題があることが多く、上行はクレシェンド、下行はデクレシェンドで練習すること。教則本の順番どおりでなく、やりやすいパターンから始めてよい。「頭の中で鳴っている音 → マウスピース → 楽器」の順です。",
    source: {
      title: "リップスラーのコツと練習方法【金管楽器初心者必見】 - ポジティBlog",
      author: "ポジティBlog",
      url: "https://positiveteacher.hatenablog.com/entry/rippsular",
      lang: "ja",
    },
  },
  {
    id: "mead-vowels",
    topics: ["lip-slur"],
    triggers: ["slur-missing", "missed-below"],
    title: "音域で母音を変える: 低音 AW、中音 AH、高音 OO",
    cue: "上の音に届かないときは母音を「オー」から「ウー」へ",
    detail:
      "ユーフォニアム奏者 Steven Mead の助言として紹介されているものです。中音域は AH、低音域は AW、高音域は OO、さらに上は EE と、音域に合わせて口の中の形（母音）を変え、息の速さを揃えます。低音金管では母音の変化と安定した息の両方が要ります。",
    quote: "In the mid-range imagine the sound 'AH'... In the low range 'AW' and in the upper range 'OO'",
    source: {
      title: "Lip Slur Difficulty（dwerden.com フォーラム）",
      author: "Steven Mead の助言の紹介",
      url: "https://forum.dwerden.com/forum/euphonium-tuba-and-general-music/general-music-discussion/performance-practice-tips-advice/7765-lip-slur-difficulty",
      lang: "en",
    },
  },
  {
    id: "dunham-no-cheat-slur",
    topics: ["lip-slur"],
    triggers: ["slur-gap", "slur-extra"],
    title: "上がるときに舌や息の「ポン」でごまかさない",
    cue: "上の音を舌で突かない。息のスピードだけで移る",
    detail:
      "Dunham はリップスラーをまずマウスピースで、次に楽器で練習するよう勧め、上行は下行よりずっと難しいので、上の音をタンギングしたり息を「ポン」と出して届かせるごまかしをしないよう注意しています。",
    quote: "Don't cheat the slur by tonguing the upper note when slurring back upward or by using a pop of air to reach the upper note.",
    source: {
      title: "Tips for Better Tuba Playing – The Instrumentalist",
      author: "David Dunham",
      url: "https://theinstrumentalist.com/february-2020/tips-for-better-tuba-playing/",
      lang: "en",
    },
  },
  {
    id: "bewley-say-it-fast",
    topics: ["tonguing"],
    triggers: ["before-start", "tonguing-few", "tonguing-uneven"],
    title: "吹きたい速さで「タータータ」と声に出して言えるか",
    cue: "「Tuh」にならない。Tah / Too / Toh を声で速く言う",
    detail:
      "チューバ・ユーフォニアム奏者 Norlan Bewley の記事です。楽器なしで Tah、Too、Toh を吹きたい速さで言えるようになるまで練習します（早口言葉と同じ）。「Tuh」が混じるのは喉が閉じて舌が動けなくなっている合図。音を止めずに「音の中で舌を動かす」感覚で、全音符を 4 つに切るように吹きます。",
    quote: "The more you hear Tuh, the more you are closing your throat and losing your tone. This also shuts your tongue down.",
    source: {
      title: "Tuba music tips – Tonguing Well",
      author: "Norlan Bewley",
      url: "https://norlanbewley.com/tuba-tips/tonguing.htm",
      lang: "en",
    },
  },
  {
    id: "ishikura-ku-with-air",
    topics: ["tonguing"],
    triggers: ["tonguing-few", "tonguing-uneven"],
    title: "「ク」のときも息を出す（「クゥー」）",
    cue: "手のひらに向かって息だけで「トゥクトゥク」。「ク」でも同じ息が出ているか",
    detail:
      "ユーフォニアム奏者 石倉雄太氏の記事です。ダブルタンギングで大切なのは「ク」のときに息がしっかり出ているか。「ク」というより「クゥー」と息が出るように言い、「ク」のときも「トゥ」と同じ口の狭さにして息の通り道を細くするとやりやすくなります。",
    quote: "『ク』というよりは『クゥー』と息が出るように言ってみてください",
    source: {
      title: "ダブルタンギングのコツ | 石倉雄太",
      author: "石倉雄太",
      url: "https://yutaishikura.com/euph-013/",
      lang: "ja",
    },
  },
  {
    id: "dunham-tdoh",
    topics: ["tonguing", "attack"],
    triggers: ["tonguing-off", "slow-rise"],
    title: "「トー」と「ドー」の中間で発音する",
    cue: "16 分音符は「toh」で前をはっきり。低音は少し咳のように",
    detail:
      "Dunham は普段は T と D の中間「tdoh」で発音し、16 分音符では「toh」にして音の前をはっきりさせ息の圧を上げる、低音は少し咳をするように押し出す、と述べています。",
    quote: "I use a T and D hybrid articulation where I simultaneously think tdoh.",
    source: {
      title: "Tips for Better Tuba Playing – The Instrumentalist",
      author: "David Dunham",
      url: "https://theinstrumentalist.com/february-2020/tips-for-better-tuba-playing/",
      lang: "en",
    },
  },
  {
    id: "fifth-partial-flat",
    topics: ["pitch-accuracy", "general"],
    triggers: ["drone-flat", "missed-below"],
    title: "第 5 倍音（1-2 の H、開放の D など）は低めに出る",
    cue: "第 5 倍音の音は楽器の癖で低い。耳で少し上げる",
    detail:
      "TubaForum での経験者の指摘です。第 5 倍音はよい楽器でも低くなりやすい、最も癖の強い倍音です。B♭ 管の H3（1-2）や D4（開放）がこれに当たります。正しい音を聴けていても楽器が低く出すので、その音では意識的に上げるか替え指を使います。",
    quote: "the fifth partial is the most notorious partial, even on good tubas... that partial will commonly be flat.",
    source: {
      title: "Cannot play a specific note well - TubaForum.net",
      author: "TubaForum.net の投稿（matt g ほか）",
      url: "https://tubaforum.net/viewtopic.php?t=8976",
      lang: "en",
    },
  },
  {
    id: "wilktone-sing-for-ear",
    topics: ["ear"],
    triggers: ["sing-off", "before-start"],
    title: "耳を作るなら、まず声で歌う",
    cue: "音程の練習は声で。バズは補助",
    detail:
      "トロンボーン奏者 Dave Wilken はマウスピースのバズに慎重な立場で、バズは楽器の演奏と違いすぎると指摘しつつ、耳を育てるには歌うことを勧めています。音を取るのが苦手な人は、バズより先に「聴いて歌う」を毎日短時間やるのが近道です。",
    quote: "Getting good at buzzing in the mouthpiece is simply different from playing on the instrument and what works well for buzzing is not necessarily great for consistent playing.",
    source: {
      title: "Thoughts On Mouthpiece Buzzing – Wilktone",
      author: "Dave Wilken",
      url: "https://wilktone.com/?p=4133",
      lang: "en",
    },
  },
  {
    id: "jacobs-sound-not-air",
    topics: ["general", "attack"],
    triggers: ["unstable", "slow-rise", "drone-wobbly"],
    title: "息ではなく、出したい音に集中する",
    cue: "欲しい音が頭にあれば、息は付いてくる",
    detail:
      "ジェイコブスは、出したい音がはっきりしていれば必要な息も自然に整う、常に音が先で息は後、と教えました。出だしが揺れるとき、息の量や唇の操作より「どんな音を出すか」を先に決めます。",
    quote: "When you have the sound that you want you'll also have the air that you want. But, it's always based on the sound, not the air.",
    source: {
      title: "Brief Teachings of Arnold Jacobs（dwerden.com フォーラム）",
      author: "Arnold Jacobs の教えの紹介",
      url: "https://forum.dwerden.com/forum/euphonium-tuba-and-general-music/general-music-discussion/performance-practice-tips-advice/10052-brief-teachings-of-arnold-jacobs",
      lang: "en",
    },
  },
];

export const TOPIC_LABELS: Record<Topic, string> = {
  ear: "耳・音程を取る",
  "pitch-accuracy": "音を当てる",
  attack: "出だし",
  "lip-slur": "リップスラー",
  tonguing: "タンギング",
  general: "全般",
};

/** 出来事に合うアドバイスを優先度順に返す。topic を渡すとその分野を優先する。 */
export function adviceFor(trigger: Trigger, topic?: Topic, limit = 2): Advice[] {
  const hits = ADVICE.filter((a) => a.triggers.includes(trigger));
  const sorted = topic ? [...hits].sort((a, b) => Number(b.topics.includes(topic)) - Number(a.topics.includes(topic))) : hits;
  return sorted.slice(0, limit);
}

/** その分野の「今日のポイント」を 1 つ選ぶ（日替わり） */
export function dailyAdvice(topic: Topic, seed = Math.floor(Date.now() / 86400000)): Advice {
  const pool = ADVICE.filter((a) => a.topics.includes(topic) && a.triggers.includes("before-start"));
  const list = pool.length ? pool : ADVICE.filter((a) => a.topics.includes(topic));
  return list[seed % list.length];
}

export function adviceById(id: string): Advice | undefined {
  return ADVICE.find((a) => a.id === id);
}
