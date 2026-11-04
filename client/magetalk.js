// ===== BALOT MAGI SUHBATLARI: har tugunda mag gapiradi va o'yinchiga 4 ta javob varianti chiqadi; har javob - yangi tugun (yoki harakat).
// swamp - botqoqdagi uyida (yengilgandan keyin), farm - o'yinchining fermasiga ko'chib kelgach. Matnlar: en / ru.
// Variant: t - matn, to - keyingi tugun (null - suhbat tugaydi), act - avval harakat (lift / swing / hug / twirl / dance / magic / invite),
// need(ctx) - faqat shart bajarilsa ko'rinadi (ro'yxatdan birinchi 4 tasi olinadi), gain - suhbat yoqdi (+simpatiya oxirida)
(function () {
    const L = (en, ru) => ({ en, ru });
    const tx = (v) => (typeof v === 'string' ? v : (v[typeof getLang === 'function' ? getLang() : 'en'] || v.en));
    const BYE = { t: L('I have to go. See you soon!', 'Мне пора. До скорой встречи!'), to: null };
    const BACK = { t: L('Let\'s talk about something else.', 'Давай поговорим о другом.'), to: 'hi' };
    const FBACK = { t: L('Let\'s talk about something else.', 'Давай поговорим о другом.'), to: 'hi' };
    const FBYE = { t: L('I\'ll get back to work. See you!', 'Пойду поработаю. Ещё увидимся!'), to: null };

    // ================= BOTQOQDA =================
    const SWAMP = {
        hi: {
            say: (c) => [c.sym >= 12 ? L('There you are! I was just thinking about you.', 'Вот и ты! А я как раз о тебе думал.')
                : c.sym >= 5 ? L('Welcome back! The flowers perked up when they saw you.', 'С возвращением! Цветы оживились, когда тебя увидели.')
                    : L('Oh. Hello again, visitor.', 'О. Снова здравствуй, гость.')],
            max: 5,
            opts: [
                { t: L('How are you today?', 'Как ты сегодня?'), to: 'mood' },
                { t: L('Tell me about this swamp.', 'Расскажи об этом болоте.'), to: 'swamp' },
                { t: L('Let\'s do something fun!', 'Давай сделаем что-нибудь весёлое!'), to: 'fun' },
                // FERMAGA TAKLIF - doim ko'rinadi: do'stlik va gullar yetsa - taklif, yetmasa - nima yetishmayotganini aytadi
                { t: L('Come live with me on my farm!', 'Переезжай ко мне на ферму!'), to: (c) => (c.canInvite ? 'invite' : 'notyet') },
                BYE
            ]
        },
        mood: {
            say: [L('Today the fog is soft and the frogs are singing. A good day.', 'Сегодня туман мягкий, а лягушки поют. Хороший день.')],
            opts: [
                { t: L('What do frogs sing about?', 'О чём поют лягушки?'), to: 'frogs' },
                { t: L('What makes a day bad for you?', 'А что делает день плохим?'), to: 'badday' },
                { t: L('I\'m glad you\'re happy.', 'Здорово, что тебе хорошо.'), to: 'glad', gain: 1 },
                BACK
            ]
        },
        frogs: {
            say: [L('Mostly about flies. But one old frog sings about the moon every night.', 'В основном о мухах. Но одна старая лягушка каждую ночь поёт о луне.')],
            opts: [
                { t: L('Can I hear him?', 'Можно его послушать?'), to: 'moonfrog' },
                { t: L('Do you sing too?', 'А ты тоже поёшь?'), to: 'sing' },
                { t: L('Frogs are funny little friends.', 'Лягушки - забавные друзья.'), to: 'glad', gain: 1 },
                BACK
            ]
        },
        moonfrog: {
            say: [L('Shh... listen... *croooak*... That was him. He is shy, but he likes you.', 'Тсс... слушай... *ква-а-а*... Это он. Он стеснительный, но ты ему нравишься.')],
            opts: [
                { t: L('That was beautiful.', 'Это было красиво.'), to: 'glad', gain: 1 },
                { t: L('Do you have other friends here?', 'У тебя здесь есть другие друзья?'), to: 'lonely' },
                { t: L('Sing with him!', 'Спой вместе с ним!'), to: 'sing' },
                BACK
            ]
        },
        sing: {
            say: [L('Me? Well... only when nobody is listening.', 'Я? Ну... только когда никто не слышит.'), L('...La-la-laaa, the mud is warm, the moon is round...', '...Ла-ла-ла-а, тёплый ил, луна кругла...')],
            opts: [
                { t: L('Bravo! Spin for me!', 'Браво! Покружись!'), act: 'twirl', to: 'glad' },
                { t: L('You have a lovely voice.', 'У тебя чудесный голос.'), to: 'blush', gain: 1 },
                { t: L('Let\'s dance to it!', 'Давай под неё потанцуем!'), act: 'dance', to: 'glad' },
                BACK
            ]
        },
        blush: {
            say: [L('L-lovely? Nobody ever said that. My hood is getting warm...', 'Ч-чудесный? Мне никто такого не говорил. Под капюшоном стало жарко...')],
            opts: [
                { t: L('I mean it.', 'Я серьёзно.'), to: 'glad', gain: 1 },
                { t: L('Can I see your face now?', 'Теперь можно увидеть твоё лицо?'), to: 'face' },
                { t: L('Let\'s do something fun!', 'Давай сделаем что-нибудь весёлое!'), to: 'fun' },
                BYE
            ]
        },
        badday: {
            say: [L('Days when nobody visits. The swamp is very quiet then.', 'Дни, когда никто не приходит. Тогда на болоте очень тихо.')],
            opts: [
                { t: L('Then I\'ll visit more often.', 'Тогда я буду приходить чаще.'), to: 'glad', gain: 1 },
                { t: L('Are you lonely here?', 'Тебе здесь одиноко?'), to: 'lonely' },
                { t: L('Is that why you fought us?', 'Поэтому ты с нами сражался?'), to: 'fight' },
                BACK
            ]
        },
        glad: {
            say: [L('Hehe. You always know what to say.', 'Хе-хе. Ты всегда знаешь, что сказать.')],
            opts: [
                { t: L('Tell me something about you.', 'Расскажи что-нибудь о себе.'), to: 'past' },
                { t: L('Let\'s do something fun!', 'Давай сделаем что-нибудь весёлое!'), to: 'fun' },
                { t: L('What gifts do you like?', 'Какие подарки ты любишь?'), to: 'gifts' },
                BYE
            ]
        },
        fight: {
            say: [L('I was bored, and a fight is still a kind of visit. I\'m sorry. I won\'t do it again.', 'Мне было скучно, а драка - тоже своего рода визит. Прости. Больше не буду.')],
            opts: [
                { t: L('Apology accepted.', 'Извинения приняты.'), to: 'glad', gain: 1 },
                { t: L('You were really strong, you know.', 'А ведь ты был очень сильным.'), to: 'staff' },
                { t: L('Next time just say "hi".', 'В следующий раз просто скажи «привет».'), to: 'glad' },
                BACK
            ]
        },
        swamp: {
            say: [L('My swamp! Warm mud, glowing mushrooms, flowers that bite only rude people.', 'Моё болото! Тёплый ил, светящиеся грибы и цветы, которые кусают только грубиянов.')],
            opts: [
                { t: L('Your flowers bite?!', 'Твои цветы кусаются?!'), to: 'flowers' },
                { t: L('What are you brewing in that pot?', 'Что ты варишь в котле?'), to: 'potions' },
                { t: L('How long have you lived here?', 'Давно ты здесь живёшь?'), to: 'past' },
                BACK
            ]
        },
        flowers: {
            say: [L('Only a little! I water them every morning and tell them stories. They love you, by the way.', 'Совсем чуть-чуть! Я поливаю их каждое утро и рассказываю им сказки. Кстати, ты им нравишься.')],
            opts: [
                { t: L('What stories do flowers like?', 'Какие сказки любят цветы?'), to: 'story' },
                { t: L('Do you like flowers as gifts?', 'Ты любишь цветы в подарок?'), to: 'gifts' },
                { t: L('I grow flowers on my farm too!', 'Я тоже выращиваю цветы на ферме!'), to: 'farm' },
                BACK
            ]
        },
        story: {
            say: [L('About the sun. They\'ve never seen much of it down here in the fog. So I tell them it\'s a huge warm flower in the sky.', 'О солнце. Здесь, в тумане, они его почти не видят. Я говорю им, что это огромный тёплый цветок в небе.')],
            opts: [
                { t: L('That\'s a sweet story.', 'Какая милая сказка.'), to: 'glad', gain: 1 },
                { t: L('My farm has lots of sun.', 'На моей ферме много солнца.'), to: 'farm' },
                { t: L('Tell me another one!', 'Расскажи ещё одну!'), to: 'secret' },
                BACK
            ]
        },
        potions: {
            say: [L('Mud tea with frog moss. Very healthy. Probably. Want a sip?', 'Иловый чай с лягушачьим мхом. Очень полезно. Наверное. Хочешь глоток?')],
            opts: [
                { t: L('Sure, one sip!', 'Давай, один глоток!'), to: 'tea' },
                { t: L('Maybe later...', 'Может, потом...'), to: 'mood' },
                { t: L('Can you do real magic?', 'А ты умеешь настоящее волшебство?'), to: 'magic' },
                BACK
            ]
        },
        tea: {
            say: [L('Here you go! ...Well? Your eyes are watering. That means it\'s working!', 'Держи! ...Ну как? У тебя слёзы на глазах. Значит, действует!')],
            opts: [
                { t: L('It\'s... very earthy!', 'Он... очень землистый!'), to: 'glad', gain: 1 },
                { t: L('Could you add some honey next time?', 'А можно в следующий раз с мёдом?'), to: 'glad' },
                { t: L('Show me some magic instead!', 'Лучше покажи волшебство!'), to: 'magic' },
                BACK
            ]
        },
        magic: {
            say: [L('Real magic? Watch closely!', 'Настоящее волшебство? Смотри внимательно!')],
            opts: [
                { t: L('Make the swamp sparkle!', 'Пусть болото засияет!'), act: 'magic', to: 'glad' },
                { t: L('Can you lift me up with magic?', 'Можешь поднять меня магией?'), to: 'lift' },
                { t: L('Where did you learn it?', 'Где ты этому научился?'), to: 'staff' },
                BACK
            ]
        },
        staff: {
            say: [L('This staff grew from the oldest tree in the swamp. It listens to roots, and roots listen to me.', 'Этот посох вырос из самого старого дерева болота. Он слушает корни, а корни слушают меня.')],
            opts: [
                { t: L('That\'s amazing.', 'Это потрясающе.'), to: 'glad', gain: 1 },
                { t: L('Show me what it can do!', 'Покажи, что он умеет!'), to: 'magic' },
                { t: L('How old are you, actually?', 'А сколько тебе вообще лет?'), to: 'past' },
                BACK
            ]
        },
        past: {
            say: [L('More than a hundred years. I stopped counting when the cake candles started a fire.', 'Больше ста лет. Я перестал считать, когда свечи на торте устроили пожар.')],
            opts: [
                { t: L('Haha! What happened to the cake?', 'Ха-ха! А что стало с тортом?'), to: 'glad', gain: 1 },
                { t: L('Have you always been alone?', 'Ты всегда был один?'), to: 'lonely' },
                { t: L('Why do you hide your face?', 'Почему ты прячешь лицо?'), to: 'face' },
                BACK
            ]
        },
        face: {
            say: (c) => [c.sym >= 15 ? L('...Maybe one day I\'ll show you. You\'re the first one I would show it to.', '...Может, однажды покажу. Тебе - первому.')
                : L('Ha! Nobody has seen it for a hundred years. Keep visiting and we\'ll see.', 'Ха! Его не видели уже сто лет. Заходи почаще - посмотрим.')],
            opts: [
                { t: L('I\'ll wait. No rush.', 'Я подожду. Не спеши.'), to: 'glad', gain: 1 },
                { t: L('Your pink eyes are pretty anyway.', 'Твои розовые глаза всё равно красивые.'), to: 'blush', gain: 1 },
                { t: L('Let\'s do something fun!', 'Давай сделаем что-нибудь весёлое!'), to: 'fun' },
                BACK
            ]
        },
        lonely: {
            say: [L('A little. Frogs are terrible at conversation. But now you come by, and that\'s nice.', 'Немного. Лягушки - ужасные собеседники. Но теперь приходишь ты, и это приятно.')],
            opts: [
                { t: L('Can I give you a hug?', 'Можно тебя обнять?'), to: 'hug' },
                { t: L('You could come live on my farm!', 'Ты мог бы жить у меня на ферме!'), to: 'farm' },
                { t: L('I\'m your friend now.', 'Теперь я твой друг.'), to: 'glad', gain: 1 },
                BACK
            ]
        },
        hug: {
            say: [L('A h-hug? ...Okay. Come here!', 'О-обнять? ...Ладно. Иди сюда!')],
            opts: [
                { t: L('*hug*', '*обнять*'), act: 'hug', to: 'glad' },
                { t: L('Maybe a high five instead?', 'Может, лучше «дай пять»?'), act: 'twirl', to: 'glad' },
                { t: L('Lift me up, you\'re so tall!', 'Подними меня, ты же такой высокий!'), to: 'lift' },
                BACK
            ]
        },
        fun: {
            say: [L('Fun? I know lots of fun things! What shall we do?', 'Весёлое? Я знаю много весёлого! Что будем делать?')],
            opts: [
                { t: L('Lift me up high!', 'Подними меня высоко!'), to: 'lift' },
                { t: L('Let\'s ride the swing!', 'Покатаемся на качелях!'), to: 'swing', need: (c) => c.sym >= 6 },
                { t: L('Come live with me on my farm!', 'Переезжай ко мне на ферму!'), to: 'invite', need: (c) => c.canInvite },
                { t: L('Let\'s dance!', 'Давай потанцуем!'), act: 'dance', to: 'glad' },
                { t: L('Show me magic!', 'Покажи волшебство!'), to: 'magic' },
                BACK
            ]
        },
        lift: {
            say: [L('Up you go! Hold on tight!', 'Взлетаем! Держись крепче!')],
            opts: [
                { t: L('Wheee!', 'Ура-а-а!'), act: 'lift', to: 'afterlift' },
                { t: L('Wait, I\'m scared of heights!', 'Стой, я боюсь высоты!'), to: 'glad' },
                { t: L('Higher! Higher!', 'Выше! Выше!'), act: 'lift', to: 'afterlift' },
                BACK
            ]
        },
        afterlift: {
            say: [L('Hehe, you\'re lighter than my cauldron! Did you see the whole swamp from up there?', 'Хе-хе, ты легче моего котла! Видно было всё болото оттуда?')],
            opts: [
                { t: L('Again!', 'Ещё раз!'), act: 'lift', to: 'afterlift' },
                { t: L('Let\'s ride the swing now!', 'Теперь на качели!'), to: 'swing', need: (c) => c.sym >= 6 },
                { t: L('That was amazing, thank you!', 'Это было чудесно, спасибо!'), to: 'glad', gain: 1 },
                { t: L('Put me down gently, please!', 'Только поставь аккуратно!'), to: 'glad' },
                BACK
            ]
        },
        swing: {
            say: [L('The swing? Yes, yes, yes! Nobody has ever pushed me on a swing!', 'Качели? Да, да, да! Меня ещё никто не раскачивал!')],
            opts: [
                { t: L('Sit down, I\'ll push you!', 'Садись, я тебя раскачаю!'), act: 'swing', to: null },
                { t: L('Maybe later.', 'Может, позже.'), to: 'glad' },
                { t: L('Are you sure it will hold you?', 'Уверен, что они тебя выдержат?'), to: 'swingsafe' },
                BACK
            ]
        },
        swingsafe: {
            say: [L('I built it myself, with root magic! It could hold a whole troll. ...Probably.', 'Я сам их построил, магией корней! Они бы и тролля выдержали. ...Наверное.')],
            opts: [
                { t: L('Okay, sit down!', 'Ладно, садись!'), act: 'swing', to: null },
                { t: L('"Probably"?!', '«Наверное»?!'), to: 'glad' },
                { t: L('Show me root magic!', 'Покажи магию корней!'), to: 'magic' },
                BACK
            ]
        },
        gifts: {
            say: [L('Flowers! Flowers are the best gift in the whole world. Fresh vegetables are nice too.', 'Цветы! Цветы - лучший подарок на свете. Свежие овощи тоже приятно.')],
            opts: [
                { t: L('I\'ll grow some on my farm for you.', 'Я выращу их для тебя на ферме.'), to: 'farm', gain: 1 },
                { t: L('What\'s your favourite flower?', 'Какой твой любимый цветок?'), to: 'favflower' },
                { t: L('Do you ever give gifts?', 'А ты сам даришь подарки?'), to: 'secret' },
                BACK
            ]
        },
        favflower: {
            say: [L('Pink ones. They match my eyes. Don\'t tell anyone I said that.', 'Розовые. Под цвет глаз. Только никому не говори.')],
            opts: [
                { t: L('Your secret is safe with me.', 'Твой секрет в безопасности.'), to: 'glad', gain: 1 },
                { t: L('I\'ll bring you pink ones.', 'Я принесу тебе розовые.'), to: 'glad', gain: 1 },
                { t: L('Tell me another secret!', 'Расскажи ещё секрет!'), to: 'secret' },
                BACK
            ]
        },
        secret: {
            say: [L('A secret? Once, I made a potion to talk to the moon. The moon was busy. It said "call back later".', 'Секрет? Однажды я сварил зелье, чтобы поговорить с луной. Луна была занята. Сказала: «перезвони позже».')],
            opts: [
                { t: L('Hahaha!', 'Ха-ха-ха!'), to: 'glad', gain: 1 },
                { t: L('Did you call back?', 'И ты перезвонил?'), to: 'moonfrog' },
                { t: L('You\'re the funniest mage I know.', 'Ты самый смешной маг из всех.'), to: 'blush', gain: 1 },
                BACK
            ]
        },
        farm: {
            say: (c) => [c.canInvite ? L('Your farm... with sun and flowers... It sounds like a dream.', 'Твоя ферма... с солнцем и цветами... Звучит как мечта.')
                : L('A farm with sun and flowers? It sounds lovely. Maybe one day you could show me.', 'Ферма с солнцем и цветами? Звучит чудесно. Может, однажды покажешь.')],
            opts: [
                { t: L('Come live with me on my farm!', 'Переезжай ко мне на ферму!'), to: 'invite', need: (c) => c.canInvite },
                { t: L('Would you like to see it someday?', 'Хочешь когда-нибудь её увидеть?'), to: 'notyet', need: (c) => !c.canInvite },
                { t: L('I have a swing there too!', 'Там тоже есть качели!'), to: 'swing', need: (c) => c.sym >= 6 },
                { t: L('Tell me what you\'d grow there.', 'Что бы ты там вырастил?'), to: 'gifts' },
                { t: L('Do you like sunny places?', 'Ты любишь солнечные места?'), to: 'story' },
                BACK
            ]
        },
        notyet: {
            say: (c) => [L('I would! But leaving my swamp is a big step. Bring me more flowers and visit a bit more... then ask me again.', 'Хочу! Но уйти с болота - большой шаг. Приноси ещё цветы и заходи почаще... а потом спроси снова.'),
                L('(Friendship: ' + c.sym + '/20, flowers: ' + c.f + '/10)', '(Дружба: ' + c.sym + '/20, цветы: ' + c.f + '/10)')],
            opts: [
                { t: L('Deal! I\'ll be back with flowers.', 'Договорились! Вернусь с цветами.'), to: 'glad', gain: 1 },
                { t: L('What flowers do you like?', 'Какие цветы ты любишь?'), to: 'favflower' },
                { t: L('Let\'s do something fun!', 'Давай сделаем что-нибудь весёлое!'), to: 'fun' },
                BYE
            ]
        },
        invite: {
            say: [L('L-live together? On your farm? With the sun, and your crops, and... you?', 'Ж-жить вместе? На твоей ферме? С солнцем, грядками и... тобой?'), L('...I\'d love that. Can I bring my swing?', '...Я бы очень хотел. Можно я возьму свои качели?')],
            opts: [
                { t: L('Of course! Let\'s go home!', 'Конечно! Пойдём домой!'), act: 'invite', to: null },
                { t: L('Bring your cauldron too!', 'И котёл бери!'), act: 'invite', to: null },
                { t: L('Take your time to pack.', 'Собирайся не спеша.'), act: 'invite', to: null },
                { t: L('Let me think about it a little more.', 'Дай мне ещё немного подумать.'), to: 'glad' }
            ]
        }
    };

    // ================= FERMADA =================
    const FARM = {
        hi: {
            say: (c) => [c.sym >= 25 ? L('Good to see you! The farm feels like home now.', 'Как хорошо, что ты здесь! Ферма теперь как дом.')
                : L('Hello, farmer! I was just looking after your crops.', 'Привет, фермер! Я как раз присматривал за грядками.')],
            opts: [
                { t: L('How do you like the farm?', 'Как тебе ферма?'), to: 'mood' },
                { t: L('How are the crops?', 'Как там урожай?'), to: 'crops' },
                { t: L('Let\'s do something fun!', 'Давай сделаем что-нибудь весёлое!'), to: 'fun' },
                FBYE
            ]
        },
        mood: {
            say: [L('I love it! Here the sun is warm and the mornings smell like bread.', 'Мне очень нравится! Солнце тёплое, а утро пахнет хлебом.')],
            opts: [
                { t: L('Do you miss the swamp?', 'Скучаешь по болоту?'), to: 'miss' },
                { t: L('What\'s your favourite spot here?', 'Где твоё любимое место?'), to: 'spot' },
                { t: L('I\'m glad you came.', 'Здорово, что ты переехал.'), to: 'thank', gain: 1 },
                FBACK
            ]
        },
        miss: {
            say: [L('A little. I miss the old moon frog. But I brought a bottle of swamp fog - I open it at night when I\'m homesick.', 'Немного. Скучаю по старой лунной лягушке. Но я взял бутылку болотного тумана - открываю её ночью, когда грустно.')],
            opts: [
                { t: L('We can visit the swamp together.', 'Можем съездить на болото вместе.'), to: 'thank', gain: 1 },
                { t: L('Show me the fog bottle!', 'Покажи бутылку тумана!'), act: 'magic', to: 'thank' },
                { t: L('Do you want a hug?', 'Обнять тебя?'), to: 'hug' },
                FBACK
            ]
        },
        spot: {
            say: [L('The swing, of course! And the bench, when the sun goes down.', 'Качели, конечно! И скамейка, когда садится солнце.')],
            opts: [
                { t: L('Let\'s go to the swing!', 'Пойдём на качели!'), to: 'swing' },
                { t: L('Let\'s watch the sunset together.', 'Давай вместе посмотрим закат.'), to: 'night' },
                { t: L('Mine is wherever you are.', 'Моё - там, где ты.'), to: 'blush', gain: 1 },
                FBACK
            ]
        },
        blush: {
            say: [L('W-what?! You can\'t just say things like that to a mage! My hood is on fire!', 'Ч-что?! Нельзя такое говорить магу! У меня капюшон горит!')],
            opts: [
                { t: L('Hehe, sorry. Not sorry.', 'Хе-хе, прости. Хотя нет.'), to: 'fun', gain: 1 },
                { t: L('Let me cool you off - swing time!', 'Остудим тебя - на качели!'), to: 'swing' },
                { t: L('*hug*', '*обнять*'), act: 'hug', to: 'thank' },
                FBACK
            ]
        },
        crops: {
            say: (c) => [L('I water them every morning and sing to them. The carrots are the best listeners.', 'Я поливаю их каждое утро и пою им. Морковь - лучшие слушатели.')],
            opts: [
                { t: L('What do you sing to them?', 'Что ты им поёшь?'), to: 'sing' },
                { t: L('Thank you for helping!', 'Спасибо за помощь!'), to: 'thank', gain: 1 },
                { t: L('Can we plant flowers together?', 'Посадим вместе цветы?'), to: 'flowers' },
                FBACK
            ]
        },
        sing: {
            say: [L('"Grow, little carrot, grow up to the sky, the sun is your blanket, the rain is your pie..."', '«Расти, морковка, до самых небес, солнце - твоё одеяло, а дождик - твой лес...»')],
            opts: [
                { t: L('Beautiful! Do a spin!', 'Прекрасно! Покружись!'), act: 'twirl', to: 'thank' },
                { t: L('"The rain is your pie"?', '«А дождик - твой лес»?'), to: 'blush' },
                { t: L('Let\'s dance in the field!', 'Давай потанцуем в поле!'), act: 'dance', to: 'thank' },
                FBACK
            ]
        },
        flowers: {
            say: [L('Yes! A whole row of pink ones by the house. Every time they bloom, the house will smile.', 'Да! Целый ряд розовых у дома. Каждый раз, когда они расцветут, дом будет улыбаться.')],
            opts: [
                { t: L('I\'ll buy flower seeds right away.', 'Сейчас же куплю семена цветов.'), to: 'thank', gain: 1 },
                { t: L('Can houses smile?', 'Разве дома улыбаются?'), to: 'house' },
                { t: L('You really love flowers, huh?', 'Ты правда любишь цветы, да?'), to: 'blush' },
                FBACK
            ]
        },
        house: {
            say: [L('This one does. I hear it creak happily when you come home. Houses remember kindness.', 'Этот - да. Я слышу, как он радостно скрипит, когда ты приходишь. Дома помнят доброту.')],
            opts: [
                { t: L('That\'s a lovely thought.', 'Какая чудесная мысль.'), to: 'thank', gain: 1 },
                { t: L('Do the elves agree?', 'А эльфы согласны?'), to: 'elves' },
                { t: L('Tell me a bedtime story.', 'Расскажи сказку на ночь.'), to: 'story' },
                FBACK
            ]
        },
        elves: {
            say: [L('The elves? They hid from me the first day. Now they ask me to make the tomatoes grow faster. I just tell them jokes.', 'Эльфы? В первый день они от меня прятались. Теперь просят, чтобы помидоры росли быстрее. А я рассказываю им шутки.')],
            opts: [
                { t: L('Tell me a joke too!', 'Расскажи и мне шутку!'), to: 'joke' },
                { t: L('You\'re a good neighbour.', 'Ты хороший сосед.'), to: 'thank', gain: 1 },
                { t: L('Do they like your tea?', 'А им нравится твой чай?'), to: 'cook' },
                FBACK
            ]
        },
        joke: {
            say: [L('Why did the scarecrow get a medal? Because he was outstanding in his field! ...Hehe!', 'Почему пугало наградили? Потому что оно было лучшим в своём поле! ...Хе-хе!')],
            opts: [
                { t: L('Hahaha! Another one!', 'Ха-ха-ха! Ещё!'), to: 'dream' },
                { t: L('That was terrible. I love it.', 'Ужасная шутка. Обожаю.'), to: 'thank', gain: 1 },
                { t: L('Lift me up for laughing!', 'Подними меня за смех!'), to: 'lift' },
                FBACK
            ]
        },
        cook: {
            say: [L('They drink it with honey now - your idea! I\'m making carrot soup tonight. Mud-free, I promise.', 'Теперь они пьют его с мёдом - твоя идея! Вечером варю морковный суп. Без ила, обещаю.')],
            opts: [
                { t: L('I\'ll set the table!', 'Я накрою на стол!'), to: 'thank', gain: 1 },
                { t: L('Can I help you cook?', 'Можно помочь готовить?'), act: 'magic', to: 'thank' },
                { t: L('"Mud-free"? Are you sure?', '«Без ила»? Точно?'), to: 'joke' },
                FBACK
            ]
        },
        night: {
            say: [L('At night I count stars from the roof. There are more here than above the swamp - the fog used to hide them.', 'Ночью я считаю звёзды с крыши. Их здесь больше, чем над болотом - туман их прятал.')],
            opts: [
                { t: L('How many did you count?', 'Сколько насчитал?'), to: 'dream' },
                { t: L('Can I count with you?', 'Можно считать с тобой?'), to: 'thank', gain: 1 },
                { t: L('Tell me a story under the stars.', 'Расскажи сказку под звёздами.'), to: 'story' },
                FBACK
            ]
        },
        story: {
            say: [L('Once upon a time, a lonely mage lived in a foggy swamp. One day a brave hero came... and stayed his friend forever. The end!', 'Жил-был одинокий маг в туманном болоте. Однажды пришёл смелый герой... и навсегда остался его другом. Конец!')],
            opts: [
                { t: L('I know that story!', 'Я знаю эту сказку!'), to: 'thank', gain: 1 },
                { t: L('That\'s the best ending.', 'Это лучший конец.'), to: 'hug' },
                { t: L('What happens next?', 'А что было дальше?'), to: 'dream' },
                FBACK
            ]
        },
        dream: {
            say: [L('Next? I dream of a big greenhouse full of flowers, and a pond with a moon frog of our own.', 'Дальше? Я мечтаю о большой оранжерее с цветами и пруде со своей лунной лягушкой.')],
            opts: [
                { t: L('Let\'s make it come true.', 'Давай воплотим это.'), to: 'thank', gain: 1 },
                { t: L('A moon frog of our own? Ha!', 'Своя лунная лягушка? Ха!'), to: 'joke' },
                { t: L('Let\'s do something fun now!', 'А теперь - что-нибудь весёлое!'), to: 'fun' },
                FBACK
            ]
        },
        fun: {
            say: [L('Fun time! What shall we do, farmer?', 'Время веселья! Что будем делать, фермер?')],
            opts: [
                { t: L('Lift me up!', 'Подними меня!'), to: 'lift' },
                { t: L('Swing time!', 'На качели!'), to: 'swing' },
                { t: L('Let\'s dance!', 'Давай танцевать!'), act: 'dance', to: 'thank' },
                { t: L('Show me magic!', 'Покажи волшебство!'), act: 'magic', to: 'thank' },
                FBACK
            ]
        },
        lift: {
            say: [L('Up we go! I can see the whole farm from here - can you?', 'Взлетаем! Мне видно всю ферму - а тебе?')],
            opts: [
                { t: L('Wheee!', 'Ура-а-а!'), act: 'lift', to: 'thank' },
                { t: L('Higher, to the clouds!', 'Выше, до облаков!'), act: 'lift', to: 'thank' },
                { t: L('Spin me around!', 'Покружи меня!'), act: 'lift', to: 'thank' },
                FBACK
            ]
        },
        swing: {
            say: [L('The swing! Yes! Push me high, but not too high - last time I almost touched a bird.', 'Качели! Да! Раскачай высоко, но не слишком - в прошлый раз я чуть не задел птицу.')],
            opts: [
                { t: L('Sit down, here we go!', 'Садись, поехали!'), act: 'swing', to: null },
                { t: L('Poor bird!', 'Бедная птица!'), to: 'joke' },
                { t: L('Maybe after work.', 'Может, после работы.'), to: 'crops' },
                FBACK
            ]
        },
        hug: {
            say: [L('Come here, you! Best farmer in the world.', 'Иди сюда! Лучший фермер на свете.')],
            opts: [
                { t: L('*hug*', '*обнять*'), act: 'hug', to: 'thank' },
                { t: L('Best mage in the world.', 'Лучший маг на свете.'), act: 'hug', to: 'blush' },
                { t: L('Group hug with the elves!', 'Обнимашки с эльфами!'), act: 'hug', to: 'elves' },
                FBACK
            ]
        },
        thank: {
            say: [L('Thank you for bringing me here. I\'m not lonely anymore.', 'Спасибо, что я теперь здесь, с тобой. Мне больше не одиноко.')],
            opts: [
                { t: L('Thank you for coming.', 'Спасибо, что пришёл.'), to: 'hug', gain: 1 },
                { t: L('Let\'s do something fun!', 'Давай сделаем что-нибудь весёлое!'), to: 'fun' },
                { t: L('Tell me about your dreams.', 'Расскажи о своих мечтах.'), to: 'dream' },
                FBYE
            ]
        }
    };

    // SOVG'AGA JAVOB: gul - har xil quvonchli gaplar, boshqa hosil - umumiy
    const GIFT_FLOWER = [
        L('A flower! For me?! It\'s beautiful!', 'Цветок! Мне?! Какая красота!'),
        L('Eee! Pink! You remembered!', 'И-и-и! Розовый! Ты помнишь!'),
        L('I\'ll put it right next to my bed. Thank you!', 'Поставлю его у кровати. Спасибо!'),
        L('Flowers again? You spoil me... don\'t stop!', 'Опять цветы? Ты меня балуешь... не переставай!')
    ];
    const GIFT_OTHER = [
        L('For me? Thank you! It will go straight into my soup.', 'Мне? Спасибо! Прямо в суп пойдёт.'),
        L('How thoughtful! The frogs will be jealous.', 'Как мило! Лягушки обзавидуются.'),
        L('Ooh, fresh from the farm! Thank you!', 'О, свежее с фермы! Спасибо!')
    ];
    const TREES = { swamp: SWAMP, farm: FARM };

    // SUHBAT: tugun gaplari -> 4 ta variant -> keyingi tugun. ctx: { sym, f, canInvite, name, face, onAct(act, done), onEnd(liked) }
    function run(X, tree, ctx) {
        const T = TREES[tree]; if (!T || !X || !X.dialog) return;
        let liked = 0;
        const go = (id, echo) => {
            if (!id || !T[id]) { if (ctx.onEnd) ctx.onEnd(liked); return; }
            const n = T[id], say = typeof n.say === 'function' ? n.say(ctx) : n.say;
            const opts = n.opts.filter(o => !o.need || o.need(ctx)).slice(0, n.max || 4);
            const lines = [...(echo ? [{ who: 'player', text: tx(echo) }] : []), ...say.map(s => ({ who: 'elf', text: tx(s) }))];
            X.dialog(lines, null, { elfName: ctx.name, elfFace: ctx.face, free: true, choices: opts.map(o => ({ text: tx(o.t), pick: () => {
                if (o.gain) liked++;
                const to = typeof o.to === 'function' ? o.to(ctx) : o.to;   // keyingi tugun holatga qarab (masalan, taklif / hali emas)
                if (o.act && ctx.onAct) ctx.onAct(o.act, () => go(to, null));
                else go(to, to ? o.t : null);
            } })) });
        };
        go('hi', null);
    }
    const pick = (arr) => tx(arr[Math.floor(Math.random() * arr.length)]);

    // ===== HARAKATLAR / QUVONCH (botqoqda ham, fermada ham): pm.fx = { k, at, until } - kadr va siljish shu yerdan
    // kadrlar: 0 turish, 1 qadam, 2 hassa ko'tarilgan, 3 hassa yerga, 4 egilgan (suv quyish), 5 quchoq (qo'llar oldinga), 6 o'tirish, 7 ko'tarish (qo'llar tepada),
    // 8 kafti yuzida (gulni hidlash / meva yeyish), 9 cho'kkalab yerga qo'l (gul ekish)
    const FX_MS = { joy: 2600, twirl: 1700, dance: 2800, magic: 2200, hug: 2400, lift: 2800, smell: 2600, plant: 1900, eat: 3000 };
    const FX = {
        start(pm, k, now, extra) { pm.fx = Object.assign({ k, at: now, until: now + (FX_MS[k] || 2000) }, extra || {}); pm.fxNext = 0; },
        on(pm, now) { return !!(pm.fx && now < pm.fx.until); },
        heartKey(scene) {
            if (!scene.textures.exists('mg_heart')) {
                const g = scene.make.graphics({ x: 0, y: 0, add: false }), P = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
                P.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X') { g.fillStyle(y < 2 && (x === 1 || x === 4) ? 0xffc1e3 : 0xff4f9a, 1); g.fillRect(x * 3, y * 3, 3, 3); } }));
                g.generateTexture('mg_heart', 21, 18); g.destroy();
            }
            return 'mg_heart';
        },
        hearts(scene, x, y, n, depth) {
            const key = FX.heartKey(scene);
            for (let i = 0; i < n; i++) {
                const h = scene.add.image(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 30, key).setDepth(depth || 3).setScale(0.6 + Math.random() * 0.6);
                scene.tweens.add({ targets: h, y: h.y - 50 - Math.random() * 40, x: h.x + (Math.random() - 0.5) * 30, alpha: 0, duration: 900 + Math.random() * 500, onComplete: () => h.destroy() });
            }
        },
        sparks(scene, x, y, n, depth, cols) {
            const C = cols || [0x9cff6e, 0xff6fb0, 0xfff59d, 0x80deea];
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 60, s = scene.add.rectangle(x, y, 4, 4, C[i % C.length]).setDepth(depth || 3);
                scene.tweens.add({ targets: s, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r - 20, alpha: 0, angle: 180, duration: 700 + Math.random() * 500, onComplete: () => s.destroy() });
            }
        },
        // poza: { fr, dx, dy, flip, ang } yoki null (harakat yo'q). top - mag boshi tepasi (zarrachalar uchun)
        // kadrlar (swampmage_act.png, kadr = 10 + varaqdagi o'rni): 10-15 hujum, 16-18 quchoq, 19-21 suv quyish, 22-23 arg'imchoqda, 24-27 turish/yurish,
        // 28-31 raqs, 32-34 yeyish, 35-37 hidlash, 38-40 ko'tarish, 41-43 ekish (tiz cho'kib), 44-46 qozon aralashtirish
        pose(scene, pm, now, x, top, depth) {
            if (!FX.on(pm, now)) { pm.fx = null; return null; }
            const k = pm.fx.k, el = now - pm.fx.at, emit = (ms, fn) => { if (now >= (pm.fxNext || 0)) { pm.fxNext = now + ms; fn(); } };
            if (k === 'joy') { emit(170, () => FX.hearts(scene, x, top + 20, 2, depth + 0.1)); return { fr: Math.abs(Math.sin(el / 150)) > 0.35 ? 28 : 31, dx: 0, dy: -Math.abs(Math.sin(el / 150)) * 22, flip: Math.floor(el / 330) % 2 === 1, ang: Math.sin(el / 150) * 4 }; }
            if (k === 'twirl') { emit(120, () => FX.sparks(scene, x, top + 60, 3, depth + 0.1)); return { fr: Math.floor(el / 240) % 2 ? 29 : 28, dx: 0, dy: -Math.abs(Math.sin(el / 240)) * 10, flip: Math.floor(el / 120) % 2 === 1, ang: 0 }; }
            if (k === 'dance') { emit(260, () => FX.sparks(scene, x, top + 90, 2, depth + 0.1, [0xff6fb0, 0xfff59d])); return { fr: Math.floor(el / 260) % 2 ? 30 : 31, dx: Math.sin(el / 210) * 18, dy: -Math.abs(Math.sin(el / 260)) * 12, flip: Math.floor(el / 520) % 2 === 1, ang: Math.sin(el / 260) * 7 }; }
            if (k === 'magic') { emit(90, () => FX.sparks(scene, x + (Math.random() - 0.5) * 120, top + 40 + Math.random() * 80, 3, depth + 0.1)); return { fr: 12, dx: 0, dy: -6 - Math.sin(el / 200) * 6, flip: false, ang: 0 }; }
            if (k === 'hug') { emit(200, () => FX.hearts(scene, x, top + 30, 1, depth + 0.1)); return { fr: el < 320 ? 16 : Math.floor((el - 320) / 480) % 2 ? 18 : 17, dx: 0, dy: 0, flip: false, ang: 0 }; }   // 16 qo'llar ochiq -> 17/18 bag'riga bosib quchoqlaydi
            if (k === 'lift') { emit(260, () => FX.hearts(scene, x, top - 20, 1, depth + 0.1)); return { fr: el < 350 ? 38 : el < 700 ? 39 : 40, dx: 0, dy: 0, flip: false, ang: Math.sin(el / 260) * 3 }; }   // engashib ushlaydi -> ko'taradi -> boshi ustida
            // GULNI HIDLAYDI: kafti yuzida, chuqur nafas (boshi biroz ko'tariladi), yuraklar
            if (k === 'smell') { emit(380, () => FX.hearts(scene, x, top + 6, 1, depth + 0.1)); return { fr: el < 500 ? 35 : el < 1900 ? 36 : 37, dx: 0, dy: -Math.max(0, Math.sin(el / 420)) * 3, flip: false, ang: -Math.sin(el / 420) * 3 }; }   // ushlaydi -> yuziga olib hidlaydi -> mamnun
            // GULNI EKADI: cho'kkalab, qo'li yerda - tuproq sachraydi
            if (k === 'plant') { emit(160, () => FX.sparks(scene, x + (pm.f || 1) * 52, top + 150, 2, depth + 0.1, [0x5d4037, 0x795548, 0x8d6e63])); return { fr: el < 300 ? 41 : Math.floor(el / 350) % 2 ? 42 : 43, dx: 0, dy: 0, flip: false, ang: 0 }; }   // tiz cho'kadi -> yerga qo'yadi / tuproqni silaydi
            // MEVANI YEYDI: qo'lida og'ziga olib boradi, har tishlaganda boshi qimirlaydi, uvoq to'kiladi
            if (k === 'eat') {
                const bite = Math.floor(el / 700);
                if (bite !== pm.fxBite) { pm.fxBite = bite; if (bite > 0 && bite < 4) FX.sparks(scene, x + (pm.f || 1) * 16, top + 46, 4, depth + 0.1, [0xfff59d, 0xffcc80, 0xe57373]); }
                return { fr: el < 400 ? 32 : el % 700 < 330 ? 33 : 34, dx: 0, dy: 0, flip: false, ang: 0 };   // ushlaydi -> tishlaydi -> chaynaydi
            }
            return null;
        },
        // qo'ldagi / yerdagi sovg'a (hidlash, yeyish, ekish va quvonch paytida): { x, y, sc, ang } yoki null. x,y - kadr tagi (oyoq), flip - yo'nalish
        itemAt(pm, now, x, y, flip) {
            if (!pm.fx || !pm.fx.item) return null;
            const k = pm.fx.k, el = now - pm.fx.at;
            if (k === 'joy') return { x: x + flip * 30, y: y - 118, sc: 1.1, ang: Math.sin(now / 120) * 10 };
            if (k === 'smell') return el < 500 ? { x: x + flip * 32, y: y - 86, sc: 0.85, ang: -flip * 10 } : { x: x + flip * 20, y: y - 111, sc: 0.85, ang: -flip * 20 };   // qo'li: ko'krak oldida -> yuzida
            if (k === 'eat') { const sc = 0.85 * Math.max(0, 1 - Math.floor(el / 700) * 0.28), h = el < 400 ? [40, 92] : el % 700 < 330 ? [18, 101] : [30, 84]; return sc > 0.1 ? { x: x + flip * h[0], y: y - h[1], sc, ang: flip * 10 } : null; }   // qo'li: ko'krakda -> og'zida -> pastroqda
            if (k === 'plant') { const q = Math.min(1, el / 1500); return { x: x + flip * 30, y: y - 4 - (1 - q) * 6, sc: 0.75 * (0.4 + 0.6 * (1 - q)), ang: 0 }; }
            return null;
        },
        // sovg'ani qabul qilish: gul - hidlaydi, keyin bog'ga borib ekadi (pm.plant = true); boshqasi (meva / sabzavot) - yeydi
        gift(pm, item, now) { if (item === 'flower') { FX.start(pm, 'smell', now, { item }); pm.plant = true; } else FX.start(pm, 'eat', now, { item }); },
        // ekilgan gullar teksturasi (fermadagi gul ekini rasmi)
        flowerKey(scene) {
            const key = 'held_flower';
            if (!scene.textures.exists(key) && window.FarmArt && !scene.__mgFlowerReq) { scene.__mgFlowerReq = 1; scene.textures.addBase64(key, FarmArt.cropIcon('flower')); }
            return scene.textures.exists(key) ? key : null;
        },
        // BOG': ekilgan gullar (soni - magga berilgan gullar, 14 tagacha) - xs(i) joylarida
        garden(scene, store, n, xs, gy, depth) {
            const key = FX.flowerKey(scene);
            if (!key) return;
            store.imgs = store.imgs || [];
            while (store.imgs.length < 14) store.imgs.push(scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(depth).setScale(0.6).setVisible(false));
            store.imgs.forEach((im, i) => { if (!im.scene) return; const on = i < n; im.setVisible(on); if (on) im.setPosition(xs(i), gy + 2).setAngle(Math.sin(scene.time.now / 700 + i) * 3); });
        },
        // KO'TARISH: qahramon mag qo'llarida (boshidan tepada), oxirida yengil tushadi. hero - fizika jismi
        // QUCHOQ: qo'llarini ochadi (qahramon oldiga tortiladi) -> ko'tarib ko'kragiga bosadi (qahramon magning ORQASIDA chiziladi -
        // qo'llari uning ustidan o'raladi), sekin qisib turadi -> oxirida yerga qo'yadi. x - mag markazi, top + 158 - oyog'i
        liftHero(hero, pm, now, x, top) {
            const k = pm.fx && now < pm.fx.until ? pm.fx.k : null;
            if ((k === 'lift' || k === 'hug') && hero && hero.body && !hero.isDead) {
                const el = now - pm.fx.at;
                if (!pm.lifted) { pm.lifted = k; pm.liftG = hero.body.allowGravity; pm.liftD = hero.depth; pm.liftFrom = { x: hero.x, y: hero.y }; }
                hero.body.setAllowGravity(false); hero.setVelocity(0, 0);
                if (k === 'lift') {
                    const up = Math.min(1, el / 400);
                    hero.setPosition(x + Math.sin(el / 300) * 10, top + 40 - up * 70 - Math.abs(Math.sin(el / 280)) * 16);
                } else {
                    const f = pm.f < 0 ? -1 : 1, feet = top + 158, dur = pm.fx.until - pm.fx.at, sm = (v) => v * v * (3 - 2 * v);
                    const come = sm(Math.min(1, el / 320));                                                    // oldiga tortiladi
                    const up = sm(Math.min(1, Math.max(0, (el - 320) / 280)) * Math.min(1, Math.max(0, (dur - el) / 320)));   // ko'taradi ... qo'yadi
                    const tx = x + f * (30 - up * 6), ty = feet - 24 - up * 62 + (up > 0.95 ? Math.sin(el / 230) * 2 : 0);   // ko'krak oldida, qisib turadi
                    const from = pm.liftFrom || { x: tx, y: feet - 24 };
                    hero.setPosition(from.x + (tx - from.x) * come, (come < 1 ? from.y + (feet - 24 - from.y) * come : ty));
                    hero.setDepth((pm.img ? pm.img.depth : 3) - 0.01);
                }
                return true;
            }
            if (pm.lifted && hero && hero.body) {
                hero.body.setAllowGravity(pm.liftG !== false); hero.setVelocity(0, pm.lifted === 'lift' ? -120 : 0);
                if (pm.liftD !== undefined) hero.setDepth(pm.liftD);
                pm.lifted = false;
            }
            return false;
        },
        MS: FX_MS
    };
    window.MageTalk = { run, FX, giftLine: (item) => pick(item === 'flower' ? GIFT_FLOWER : GIFT_OTHER), nodes: (tree) => Object.keys(TREES[tree] || {}).length, TREES, tx };
})();
