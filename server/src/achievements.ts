// YUTUQLAR (achievements): o'yinchining uzoq muddatli maqsadlari. Har biri bir marta ochiladi - tanga mukofoti beriladi,
// ba'zilari UNVON ham beradi (bosh menyuda, xona lobbisida va do'stlar ro'yxatida nik yonida ko'rinadi).
// stat - qaysi ko'rsatkich: sanagichlar (achStats - o'yinda oshib boradi) yoki hisobdan olinadigan qiymatlar (daraja, ajdarcha, dunyo...)
// Nomlari - client/i18n.js (ach_<id>, ach_<id>_d; unvon - ach_title_<id>)

export interface Achievement { id: string; stat: string; need: number; coins: number; title?: boolean; }

// Sanagichlar - kunlik topshiriqlar bilan bir xil joydan oshadi (RoomManager.dailyProgress) + topshiriqlar (quests)
export const ACH_COUNTERS = ['kills', 'bosses', 'fish', 'harvest', 'coins', 'quests'];

export const ACHIEVEMENTS: Achievement[] = [
    { id: 'kills50', stat: 'kills', need: 50, coins: 200 },
    { id: 'kills500', stat: 'kills', need: 500, coins: 800, title: true },
    { id: 'kills2000', stat: 'kills', need: 2000, coins: 2500, title: true },
    { id: 'boss1', stat: 'bosses', need: 1, coins: 150 },
    { id: 'boss10', stat: 'bosses', need: 10, coins: 800, title: true },
    { id: 'boss50', stat: 'bosses', need: 50, coins: 3000, title: true },
    { id: 'fish10', stat: 'fish', need: 10, coins: 150 },
    { id: 'fish100', stat: 'fish', need: 100, coins: 1000, title: true },
    { id: 'harvest50', stat: 'harvest', need: 50, coins: 200 },
    { id: 'harvest500', stat: 'harvest', need: 500, coins: 1500, title: true },
    { id: 'coins10k', stat: 'coins', need: 10000, coins: 300 },
    { id: 'coins100k', stat: 'coins', need: 100000, coins: 3000, title: true },
    { id: 'quests5', stat: 'quests', need: 5, coins: 300 },
    { id: 'quests30', stat: 'quests', need: 30, coins: 1500, title: true },
    { id: 'level10', stat: 'level', need: 10, coins: 300 },
    { id: 'level30', stat: 'level', need: 30, coins: 1500, title: true },
    { id: 'pet15', stat: 'pet', need: 15, coins: 1500, title: true },
    { id: 'world50', stat: 'world', need: 50, coins: 800 },
    { id: 'world100', stat: 'world', need: 100, coins: 4000, title: true },
    { id: 'cos10', stat: 'cos', need: 10, coins: 500, title: true },
    { id: 'friends5', stat: 'friends', need: 5, coins: 300, title: true },
    { id: 'streak7', stat: 'streak', need: 7, coins: 500, title: true }
];
export const achById = (id: string) => ACHIEVEMENTS.find(a => a.id === id);
