import type { en } from './en';
import type { Locale, Table } from './index';

// The game's copy for the sci-fi look: the keys the base tables word for the old toy-box picnic
// (toys, train, fence) said for the troopers, the hover tank, the shield and the swarm.
// Laid over the locale's own table (setOverlay), in all fifteen languages.

type Overlay<T> = { [K in keyof T]?: T[K] extends string ? string : Overlay<T[K]> };
export type Copy = Overlay<Table<typeof en>>;

const enSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: {
      name: 'Marine',
      skill: 'Overdrive',
      text: 'Overdrive: tank fire rate +50% for 5 s',
      cast: 'Overdrive! Fire rate +50%',
    },
    beekeeper: {
      name: 'Engineer',
      skill: 'Arc',
      text: 'Arc: lightning shocks the bugs at the shield; every tank shot is charged',
      cast: 'Arc!',
    },
    chef: {
      name: 'Heavy',
      skill: 'Orbital Strike',
      text: 'Orbital Strike: a beam hits every bug; stats cost 5% less',
      cast: 'Orbital Strike! Hits everything',
    },
  },
  stat: {
    move: { name: 'Tank speed', text: '+15% tank speed per level' },
    wall: { name: 'Shield', text: 'Max +150 and repair 150' },
  },
  hud: {
    wall: 'Shield {hp} / {max}',
    village: 'Base',
    fallen: 'The swarm broke the shield',
    reviveGain: 'Half shield back, bugs at it blown away',
  },
  flash: {
    boss: 'Wave {n} · Brood Queen!',
    revive: 'Revived! Shield half restored',
    bug: 'Golden bug! Ram it with the tank for gold',
    basket: 'Supply pod! Drive through it for a free level',
  },
  guide: {
    reverse: 'Tap anywhere to turn the tank round',
  },
  build: {
    wall: { name: 'Shield booster', text: 'Shield max +{n}' },
    gold: { name: 'Vault', text: 'Starting gold +{n}' },
  },
  ach: {
    boss1: 'Beat the Brood Queen for the first time',
    bosses: 'Beat the Brood Queen {n} times in total',
  },
  task: {
    grabs: 'Collect {n} events with the tank',
  },
  challenge: {
    paper: { name: 'Thin shield', text: 'Shield HP -40%' },
  },
};

const zhSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: {
      name: '陆战队员',
      skill: '超载',
      text: '超载：炮车攻速 +50%，持续 5 秒',
      cast: '超载！攻速 +50%',
    },
    beekeeper: {
      name: '工程师',
      skill: '电弧',
      text: '电弧：电击护盾边的虫子；炮车每一炮都带电',
      cast: '电弧！',
    },
    chef: {
      name: '重装兵',
      skill: '轨道打击',
      text: '轨道打击：光束轰击全场虫子；属性便宜 5%',
      cast: '轨道打击！全场伤害',
    },
  },
  stat: {
    move: { name: '车速', text: '每级 +15% 车速' },
    wall: { name: '护盾', text: '上限 +150 并回 150' },
  },
  hud: {
    wall: '护盾 {hp} / {max}',
    village: '回基地',
    fallen: '护盾被虫潮冲破了',
    reviveGain: '护盾回一半，炸飞贴着护盾的虫',
  },
  flash: {
    boss: '第 {n} 波 · 虫后！',
    revive: '复活！护盾恢复一半',
    bug: '黄金虫！开炮车撞它拿金币',
    basket: '补给舱！开过去免费升一级',
  },
  guide: {
    reverse: '点屏幕任意处，炮车掉头',
  },
  build: {
    wall: { name: '护盾增幅', text: '护盾上限 +{n}' },
    gold: { name: '金库', text: '开局金币 +{n}' },
  },
  ach: {
    boss1: '第一次击败虫后',
    bosses: '累计击败虫后 {n} 次',
  },
  task: {
    grabs: '开炮车收集 {n} 个随机事件',
  },
  challenge: {
    paper: { name: '薄护盾', text: '护盾血量 -40%' },
  },
};

// The other thirteen: the same keys, one line per group.

const deSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Marine", skill: "Overdrive", text: "Overdrive: Feuerrate des Panzers +50 % für 5 s", cast: "Overdrive! Feuerrate +50 %" },
    beekeeper: { name: "Ingenieur", skill: "Lichtbogen", text: "Lichtbogen: Blitze treffen die Käfer am Schild; jeder Schuss des Panzers ist geladen", cast: "Lichtbogen!" },
    chef: { name: "Koloss", skill: "Orbitalschlag", text: "Orbitalschlag: ein Strahl trifft alle Käfer; Werte kosten 5 % weniger", cast: "Orbitalschlag! Trifft alles" },
  },
  stat: { move: { name: "Panzertempo", text: "+15 % Panzertempo pro Stufe" }, wall: { name: "Schild", text: "Max. +150 und 150 aufgeladen" } },
  hud: { wall: "Schild {hp} / {max}", village: "Basis", fallen: "Der Schwarm hat den Schild durchbrochen", reviveGain: "Schild halb aufgeladen, Käfer daran weggefegt" },
  flash: { boss: "Welle {n} · Brutkönigin!", revive: "Wiederbelebt! Schild halb aufgeladen", bug: "Goldkäfer! Ramm ihn mit dem Panzer für Gold", basket: "Versorgungskapsel! Fahr hindurch für eine Gratis-Stufe" },
  guide: { reverse: "Tippe irgendwo, damit der Panzer wendet" },
  build: { wall: { name: "Schildverstärker", text: "Schild max. +{n}" }, gold: { name: "Tresor", text: "Startgold +{n}" } },
  ach: { boss1: "Besiege zum ersten Mal die Brutkönigin", bosses: "Besiege die Brutkönigin insgesamt {n}-mal" },
  task: { grabs: "Sammle {n} Ereignisse mit dem Panzer" },
  challenge: { paper: { name: "Dünner Schild", text: "Schild-LP -40 %" } },
};

const frSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Marine", skill: "Surcharge", text: "Surcharge : cadence de tir du char +50 % pendant 5 s", cast: "Surcharge ! Cadence +50 %" },
    beekeeper: { name: "Ingénieur", skill: "Arc", text: "Arc : des éclairs frappent les insectes au bouclier ; chaque tir du char est chargé", cast: "Arc !" },
    chef: { name: "Colosse", skill: "Frappe orbitale", text: "Frappe orbitale : un rayon touche tous les insectes ; les stats coûtent 5 % de moins", cast: "Frappe orbitale ! Touche tout" },
  },
  stat: { move: { name: "Vitesse du char", text: "+15 % de vitesse du char par niveau" }, wall: { name: "Bouclier", text: "Max +150 et recharge 150" } },
  hud: { wall: "Bouclier {hp} / {max}", village: "Base", fallen: "L’essaim a percé le bouclier", reviveGain: "Bouclier à moitié, insectes collés balayés" },
  flash: { boss: "Vague {n} · Reine de l’Essaim !", revive: "Ranimé ! Bouclier à moitié rechargé", bug: "Insecte doré ! Fonce dessus avec le char pour de l’or", basket: "Capsule de ravitaillement ! Passe dessus pour un niveau gratuit" },
  guide: { reverse: "Touche n’importe où pour faire demi-tour au char" },
  build: { wall: { name: "Amplificateur de bouclier", text: "Bouclier max +{n}" }, gold: { name: "Coffre-fort", text: "Or de départ +{n}" } },
  ach: { boss1: "Bats la Reine de l’Essaim pour la première fois", bosses: "Bats la Reine de l’Essaim {n} fois au total" },
  task: { grabs: "Récupère {n} événements avec le char" },
  challenge: { paper: { name: "Bouclier fin", text: "PV du bouclier -40 %" } },
};

const esSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Marine", skill: "Sobrecarga", text: "Sobrecarga: cadencia de fuego del tanque +50% durante 5 s", cast: "¡Sobrecarga! Cadencia +50%" },
    beekeeper: { name: "Ingeniero", skill: "Arco", text: "Arco: rayos electrocutan a los bichos del escudo; cada disparo del tanque va cargado", cast: "¡Arco!" },
    chef: { name: "Coloso", skill: "Ataque orbital", text: "Ataque orbital: un rayo golpea a todos los bichos; las mejoras cuestan un 5% menos", cast: "¡Ataque orbital! Golpea a todos" },
  },
  stat: { move: { name: "Velocidad del tanque", text: "+15% de velocidad del tanque por nivel" }, wall: { name: "Escudo", text: "Máx. +150 y recarga 150" } },
  hud: { wall: "Escudo {hp} / {max}", village: "Base", fallen: "El enjambre rompió el escudo", reviveGain: "Escudo a la mitad y fuera los bichos pegados" },
  flash: { boss: "Oleada {n} · ¡Reina del Enjambre!", revive: "¡Revivido! Escudo recargado a la mitad", bug: "¡Bicho dorado! Embístelo con el tanque para conseguir oro", basket: "¡Cápsula de suministros! Pasa por encima para un nivel gratis" },
  guide: { reverse: "Toca en cualquier sitio para que el tanque dé la vuelta" },
  build: { wall: { name: "Potenciador de escudo", text: "Escudo máx. +{n}" }, gold: { name: "Cámara acorazada", text: "Oro inicial +{n}" } },
  ach: { boss1: "Vence a la Reina del Enjambre por primera vez", bosses: "Vence a la Reina del Enjambre {n} veces en total" },
  task: { grabs: "Recoge {n} eventos con el tanque" },
  challenge: { paper: { name: "Escudo débil", text: "Vida del escudo -40 %" } },
};

const itSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Marine", skill: "Sovraccarico", text: "Sovraccarico: cadenza di fuoco del carro +50% per 5 s", cast: "Sovraccarico! Cadenza +50%" },
    beekeeper: { name: "Ingegnere", skill: "Arco", text: "Arco: fulmini colpiscono gli insetti allo scudo; ogni colpo del carro è carico", cast: "Arco!" },
    chef: { name: "Colosso", skill: "Colpo orbitale", text: "Colpo orbitale: un raggio colpisce tutti gli insetti; le statistiche costano il 5% in meno", cast: "Colpo orbitale! Colpisce tutti" },
  },
  stat: { move: { name: "Velocità del carro", text: "+15% velocità del carro per livello" }, wall: { name: "Scudo", text: "Max +150 e ricarica 150" } },
  hud: { wall: "Scudo {hp} / {max}", village: "Base", fallen: "Lo sciame ha sfondato lo scudo", reviveGain: "Scudo a metà, insetti addosso spazzati via" },
  flash: { boss: "Ondata {n} · Regina dello Sciame!", revive: "Rianimato! Scudo ricaricato a metà", bug: "Insetto d’oro! Speronalo col carro per l’oro", basket: "Capsula rifornimenti! Passaci sopra per un livello gratis" },
  guide: { reverse: "Tocca ovunque per far girare il carro" },
  build: { wall: { name: "Potenziatore scudo", text: "Scudo max +{n}" }, gold: { name: "Caveau", text: "Oro iniziale +{n}" } },
  ach: { boss1: "Sconfiggi la Regina dello Sciame per la prima volta", bosses: "Sconfiggi la Regina dello Sciame {n} volte in tutto" },
  task: { grabs: "Raccogli {n} eventi con il carro" },
  challenge: { paper: { name: "Scudo sottile", text: "PV scudo -40%" } },
};

const ptSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Fuzileiro", skill: "Sobrecarga", text: "Sobrecarga: cadência de tiro do tanque +50% por 5 s", cast: "Sobrecarga! Cadência +50%" },
    beekeeper: { name: "Engenheiro", skill: "Arco", text: "Arco: raios eletrocutam os insetos no escudo; todo tiro do tanque vem carregado", cast: "Arco!" },
    chef: { name: "Colosso", skill: "Ataque orbital", text: "Ataque orbital: um raio acerta todos os insetos; atributos custam 5% menos", cast: "Ataque orbital! Acerta tudo" },
  },
  stat: { move: { name: "Velocidade do tanque", text: "+15% de velocidade do tanque por nível" }, wall: { name: "Escudo", text: "Máx. +150 e recarrega 150" } },
  hud: { wall: "Escudo {hp} / {max}", village: "Base", fallen: "O enxame rompeu o escudo", reviveGain: "Escudo pela metade, insetos colados varridos" },
  flash: { boss: "Onda {n} · Rainha do Enxame!", revive: "Reviveu! Escudo recarregado pela metade", bug: "Inseto dourado! Acerte-o com o tanque para ganhar ouro", basket: "Cápsula de suprimentos! Passe por ela para um nível grátis" },
  guide: { reverse: "Toque em qualquer lugar para o tanque dar meia-volta" },
  build: { wall: { name: "Amplificador de escudo", text: "Escudo máx. +{n}" }, gold: { name: "Cofre", text: "Ouro inicial +{n}" } },
  ach: { boss1: "Derrote a Rainha do Enxame pela primeira vez", bosses: "Derrote a Rainha do Enxame {n} vezes no total" },
  task: { grabs: "Colete {n} eventos com o tanque" },
  challenge: { paper: { name: "Escudo fino", text: "Vida do escudo -40%" } },
};

const plSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Marine", skill: "Przeciążenie", text: "Przeciążenie: szybkostrzelność czołgu +50% przez 5 s", cast: "Przeciążenie! Szybkostrzelność +50%" },
    beekeeper: { name: "Inżynier", skill: "Łuk", text: "Łuk: pioruny razią robale przy tarczy; każdy strzał czołgu jest naładowany", cast: "Łuk!" },
    chef: { name: "Kolos", skill: "Uderzenie orbitalne", text: "Uderzenie orbitalne: promień trafia wszystkie robale; statystyki tańsze o 5%", cast: "Uderzenie orbitalne! Trafia wszystko" },
  },
  stat: { move: { name: "Prędkość czołgu", text: "+15% prędkości czołgu na poziom" }, wall: { name: "Tarcza", text: "Maks. +150 i ładuje 150" } },
  hud: { wall: "Tarcza {hp} / {max}", village: "Baza", fallen: "Rój przebił tarczę", reviveGain: "Tarcza do połowy, robale przy niej zmiecione" },
  flash: { boss: "Fala {n} · Królowa Roju!", revive: "Wskrzeszono! Tarcza naładowana do połowy", bug: "Złoty robal! Staranuj go czołgiem po złoto", basket: "Kapsuła zaopatrzenia! Przejedź przez nią po darmowy poziom" },
  guide: { reverse: "Dotknij gdziekolwiek, by czołg zawrócił" },
  build: { wall: { name: "Wzmacniacz tarczy", text: "Maks. tarcza +{n}" }, gold: { name: "Skarbiec", text: "Złoto na start +{n}" } },
  ach: { boss1: "Pokonaj Królową Roju po raz pierwszy", bosses: "Pokonaj Królową Roju łącznie: {n}" },
  task: { grabs: "Zbierz {n} wydarzeń czołgiem" },
  challenge: { paper: { name: "Cienka tarcza", text: "HP tarczy -40%" } },
};

const ruSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Десантник", skill: "Перегрузка", text: "Перегрузка: скорострельность танка +50% на 5 с", cast: "Перегрузка! Скорострельность +50%" },
    beekeeper: { name: "Инженер", skill: "Дуга", text: "Дуга: молнии бьют жуков у щита; каждый выстрел танка заряжен", cast: "Дуга!" },
    chef: { name: "Штурмовик", skill: "Орбитальный удар", text: "Орбитальный удар: луч бьёт всех жуков; улучшения дешевле на 5%", cast: "Орбитальный удар! Бьёт всех" },
  },
  stat: { move: { name: "Скорость танка", text: "+15% скорости танка за уровень" }, wall: { name: "Щит", text: "Макс. +150 и зарядка 150" } },
  hud: { wall: "Щит {hp} / {max}", village: "База", fallen: "Рой пробил щит", reviveGain: "Щит наполовину, жуки у него сметены" },
  flash: { boss: "Волна {n} · Королева роя!", revive: "Возрождение! Щит заряжен наполовину", bug: "Золотой жук! Тарань его танком ради золота", basket: "Капсула снабжения! Проедь через неё за бесплатный уровень" },
  guide: { reverse: "Коснись где угодно, чтобы танк развернулся" },
  build: { wall: { name: "Усилитель щита", text: "Макс. щита +{n}" }, gold: { name: "Хранилище", text: "Стартовое золото +{n}" } },
  ach: { boss1: "Впервые победи Королеву роя", bosses: "Победи Королеву роя, всего раз: {n}" },
  task: { grabs: "Собери {n} событий танком" },
  challenge: { paper: { name: "Тонкий щит", text: "HP щита -40%" } },
};

const jaSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "マリーン", skill: "オーバードライブ", text: "オーバードライブ：戦車の連射速度 +50%（5秒）", cast: "オーバードライブ！連射速度 +50%" },
    beekeeper: { name: "エンジニア", skill: "アーク", text: "アーク：シールド際の虫に電撃；戦車の弾がすべて帯電", cast: "アーク！" },
    chef: { name: "ヘビー", skill: "軌道砲撃", text: "軌道砲撃：ビームが全部の虫に命中；強化費用 5% オフ", cast: "軌道砲撃！全体攻撃" },
  },
  stat: { move: { name: "戦車速度", text: "1レベルごとに戦車速度 +15%" }, wall: { name: "シールド", text: "最大値 +150、150 回復" } },
  hud: { wall: "シールド {hp} / {max}", village: "基地へ", fallen: "虫の群れにシールドを破られた", reviveGain: "シールド半分回復、張り付いた虫を一掃" },
  flash: { boss: "ウェーブ{n} · クイーンバグ！", revive: "復活！シールドが半分回復", bug: "ゴールデンバグ！戦車で体当たりしてゴールド", basket: "補給ポッド！通過すると無料でレベルアップ" },
  guide: { reverse: "どこかをタップすると戦車が反転" },
  build: { wall: { name: "シールド強化", text: "シールドの最大値 +{n}" }, gold: { name: "金庫", text: "開始ゴールド +{n}" } },
  ach: { boss1: "クイーンバグを初めて倒す", bosses: "クイーンバグを累計{n}回倒す" },
  task: { grabs: "戦車でイベントを{n}回回収" },
  challenge: { paper: { name: "薄いシールド", text: "シールドのHP-40%" } },
};

const koSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "해병", skill: "오버드라이브", text: "오버드라이브: 전차 연사 속도 +50%, 5초", cast: "오버드라이브! 연사 속도 +50%" },
    beekeeper: { name: "엔지니어", skill: "아크", text: "아크: 보호막 앞 벌레에게 전격; 전차 포탄이 모두 충전됨", cast: "아크!" },
    chef: { name: "헤비", skill: "궤도 폭격", text: "궤도 폭격: 빔이 모든 벌레를 공격; 능력치 비용 5% 감소", cast: "궤도 폭격! 전체 공격" },
  },
  stat: { move: { name: "전차 속도", text: "레벨당 전차 속도 +15%" }, wall: { name: "보호막", text: "최대치 +150, 150 회복" } },
  hud: { wall: "보호막 {hp} / {max}", village: "기지로", fallen: "벌레 떼가 보호막을 뚫었다", reviveGain: "보호막 절반 회복, 붙은 벌레 날려버림" },
  flash: { boss: "웨이브 {n} · 여왕 벌레!", revive: "부활! 보호막 절반 회복", bug: "황금 벌레! 전차로 들이받아 골드 획득", basket: "보급 포드! 지나가면 무료 레벨 업" },
  guide: { reverse: "아무 곳이나 탭하면 전차가 방향을 바꿔요" },
  build: { wall: { name: "보호막 강화", text: "보호막 최대치 +{n}" }, gold: { name: "금고", text: "시작 골드 +{n}" } },
  ach: { boss1: "여왕 벌레 첫 처치", bosses: "여왕 벌레 누적 {n}회 처치" },
  task: { grabs: "전차로 이벤트 {n}개 획득" },
  challenge: { paper: { name: "얇은 보호막", text: "보호막 HP -40%" } },
};

const viSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Lính đặc nhiệm", skill: "Quá tải", text: "Quá tải: tốc độ bắn của xe tăng +50% trong 5 giây", cast: "Quá tải! Tốc độ bắn +50%" },
    beekeeper: { name: "Kỹ sư", skill: "Hồ quang", text: "Hồ quang: sét đánh bọ ở khiên; mọi phát bắn của xe tăng đều tích điện", cast: "Hồ quang!" },
    chef: { name: "Lính hạng nặng", skill: "Pháo kích quỹ đạo", text: "Pháo kích quỹ đạo: tia sáng đánh mọi con bọ; nâng cấp rẻ hơn 5%", cast: "Pháo kích quỹ đạo! Đánh toàn bộ" },
  },
  stat: { move: { name: "Tốc độ xe tăng", text: "+15% tốc độ xe tăng mỗi cấp" }, wall: { name: "Khiên", text: "Tối đa +150 và nạp 150" } },
  hud: { wall: "Khiên {hp} / {max}", village: "Về căn cứ", fallen: "Bầy bọ đã phá vỡ khiên", reviveGain: "Hồi nửa khiên, quét bay bọ bám khiên" },
  flash: { boss: "Đợt {n} · Bọ Chúa!", revive: "Hồi sinh! Khiên nạp lại một nửa", bug: "Bọ vàng! Lái xe tăng húc nó để lấy vàng", basket: "Khoang tiếp tế! Chạy qua để được lên cấp miễn phí" },
  guide: { reverse: "Chạm bất kỳ đâu để xe tăng quay đầu" },
  build: { wall: { name: "Tăng cường khiên", text: "Khiên tối đa +{n}" }, gold: { name: "Kho vàng", text: "Vàng khởi đầu +{n}" } },
  ach: { boss1: "Hạ Bọ Chúa lần đầu tiên", bosses: "Hạ Bọ Chúa tổng cộng {n} lần" },
  task: { grabs: "Thu thập {n} sự kiện bằng xe tăng" },
  challenge: { paper: { name: "Khiên mỏng", text: "Máu khiên -40%" } },
};

const trSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Piyade", skill: "Aşırı Yük", text: "Aşırı Yük: tankın atış hızı 5 sn boyunca +%50", cast: "Aşırı Yük! Atış hızı +%50" },
    beekeeper: { name: "Mühendis", skill: "Ark", text: "Ark: kalkandaki böcekleri şimşek çarpar; tankın her atışı yüklüdür", cast: "Ark!" },
    chef: { name: "Ağır Asker", skill: "Yörünge Saldırısı", text: "Yörünge Saldırısı: bir ışın tüm böceklere vurur; geliştirmeler %5 daha ucuz", cast: "Yörünge Saldırısı! Herkese vurur" },
  },
  stat: { move: { name: "Tank hızı", text: "Seviye başına +%15 tank hızı" }, wall: { name: "Kalkan", text: "Maks. +150 ve 150 şarj" } },
  hud: { wall: "Kalkan {hp} / {max}", village: "Üs", fallen: "Sürü kalkanı deldi", reviveGain: "Kalkan yarıya dolar, yapışan böcekler savrulur" },
  flash: { boss: "Dalga {n} · Sürü Kraliçesi!", revive: "Dirildin! Kalkan yarıya kadar şarj oldu", bug: "Altın böcek! Altın için tankla çarp", basket: "İkmal kapsülü! Bedava seviye için içinden geç" },
  guide: { reverse: "Tankı döndürmek için herhangi bir yere dokun" },
  build: { wall: { name: "Kalkan güçlendirici", text: "Maks. kalkan +{n}" }, gold: { name: "Kasa", text: "Başlangıç altını +{n}" } },
  ach: { boss1: "Sürü Kraliçesi’ni ilk kez yen", bosses: "Sürü Kraliçesi’ni toplam {n} kez yen" },
  task: { grabs: "Tankla {n} olay topla" },
  challenge: { paper: { name: "İnce kalkan", text: "Kalkan canı -%40" } },
};

const thSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "นาวิกโยธิน", skill: "โอเวอร์ไดรฟ์", text: "โอเวอร์ไดรฟ์: ความเร็วยิงของรถถัง +50% นาน 5 วินาที", cast: "โอเวอร์ไดรฟ์! ความเร็วยิง +50%" },
    beekeeper: { name: "วิศวกร", skill: "อาร์ค", text: "อาร์ค: สายฟ้าช็อตแมลงที่โล่; ทุกนัดของรถถังมีไฟฟ้า", cast: "อาร์ค!" },
    chef: { name: "ทหารหนัก", skill: "ยิงจากวงโคจร", text: "ยิงจากวงโคจร: ลำแสงโจมตีแมลงทุกตัว; ค่าอัปเกรดลด 5%", cast: "ยิงจากวงโคจร! โจมตีทั้งจอ" },
  },
  stat: { move: { name: "ความเร็วรถถัง", text: "ความเร็วรถถัง +15% ต่อเลเวล" }, wall: { name: "โล่", text: "สูงสุด +150 และชาร์จ 150" } },
  hud: { wall: "โล่ {hp} / {max}", village: "ฐานทัพ", fallen: "ฝูงแมลงเจาะโล่ทะลุแล้ว", reviveGain: "โล่ฟื้นครึ่งหนึ่ง แมลงที่เกาะโล่ปลิวไป" },
  flash: { boss: "เวฟ {n} · ราชินีแมลง!", revive: "ฟื้นคืนชีพ! โล่ชาร์จครึ่งหนึ่ง", bug: "แมลงทองคำ! ขับรถถังชนเพื่อรับทอง", basket: "แคปซูลเสบียง! ขับผ่านเพื่อรับเลเวลฟรี" },
  guide: { reverse: "แตะที่ใดก็ได้เพื่อให้รถถังกลับทิศ" },
  build: { wall: { name: "เสริมโล่", text: "โล่สูงสุด +{n}" }, gold: { name: "ห้องนิรภัย", text: "ทองเริ่มต้น +{n}" } },
  ach: { boss1: "ชนะราชินีแมลงครั้งแรก", bosses: "ชนะราชินีแมลงรวม {n} ครั้ง" },
  task: { grabs: "เก็บอีเวนต์ {n} ครั้งด้วยรถถัง" },
  challenge: { paper: { name: "โล่บาง", text: "HP โล่ -40%" } },
};

const idSci: Copy = {
  title: 'Swarm Orbit',
  hero: {
    farmer: { name: "Marinir", skill: "Overdrive", text: "Overdrive: laju tembak tank +50% selama 5 dtk", cast: "Overdrive! Laju tembak +50%" },
    beekeeper: { name: "Insinyur", skill: "Busur Listrik", text: "Busur Listrik: petir menyetrum serangga di perisai; setiap tembakan tank bermuatan", cast: "Busur Listrik!" },
    chef: { name: "Prajurit Berat", skill: "Serangan Orbit", text: "Serangan Orbit: sinar mengenai semua serangga; stat 5% lebih murah", cast: "Serangan Orbit! Kena semua" },
  },
  stat: { move: { name: "Kecepatan tank", text: "+15% kecepatan tank per level" }, wall: { name: "Perisai", text: "Maks +150 dan isi 150" } },
  hud: { wall: "Perisai {hp} / {max}", village: "Markas", fallen: "Kawanan menembus perisai", reviveGain: "Perisai pulih separuh, serangga yang menempel tersapu" },
  flash: { boss: "Gelombang {n} · Ratu Kawanan!", revive: "Hidup lagi! Perisai terisi setengah", bug: "Serangga emas! Tabrak dengan tank untuk dapat emas", basket: "Kapsul pasokan! Lewati untuk level gratis" },
  guide: { reverse: "Ketuk di mana saja untuk memutar balik tank" },
  build: { wall: { name: "Penguat perisai", text: "Maks perisai +{n}" }, gold: { name: "Brankas", text: "Emas awal +{n}" } },
  ach: { boss1: "Kalahkan Ratu Kawanan untuk pertama kali", bosses: "Kalahkan Ratu Kawanan total {n} kali" },
  task: { grabs: "Kumpulkan {n} event dengan tank" },
  challenge: { paper: { name: "Perisai tipis", text: "HP perisai -40%" } },
};

export const SCIFI_COPY: Record<Locale, Copy> = { en: enSci, zh: zhSci, de: deSci, fr: frSci, es: esSci, it: itSci, pt: ptSci, pl: plSci, ru: ruSci, ja: jaSci, ko: koSci, vi: viSci, tr: trSci, th: thSci, id: idSci };
