import { PlayerState, RoomState } from '../types';

export abstract class BaseCharacter {
    // Stamina bilan bog'liq umumiy sozlamalar (bir joyda, hammasi shu yerdan boshqariladi)
    public static readonly ATTACK_STAMINA_COST = 15;         // Standart (agar personaj o'zinikini belgilamasa)
    public static readonly ATTACK_COOLDOWN_TICKS = 12;      // ~0.36s (30ms/tick) - Enter spam qilib bo'lmaydi
    public static readonly ABILITY_DRAIN_PER_TICK = 1.2;    // SHIFT ushlab turilsa ~36 stamina/soniya sarflanadi
    public static readonly STAMINA_REGEN_PER_TICK = 0.35;   // ~10.5 stamina/soniya tiklanadi (qiyinroq bo'lishi uchun sekinlashtirildi)
    public static readonly REGEN_DELAY_TICKS = 45;          // ~1.35s: tugagach shuncha vaqt tiklanish boshlanmaydi

    // Har bir personaj o'z hujumi uchun stamina narxini shu yerda belgilaydi
    // (Ritsar/Samuray: sekin ketadi, Kamonchi: sal sekin, Sehrgar: tez ketadi)
    public attackStaminaCost: number = BaseCharacter.ATTACK_STAMINA_COST;

    // Har bir kadrda taymerlarni yangilash: cooldown va stamina tiklanish kechikishi
    public static updateTimers(player: PlayerState): void {
        if (player.attackCooldown > 0) player.attackCooldown--;

        // SHIFT (qobiliyat) ushlab turilsa - BARCHA personajlar uchun stamina ketadi
        if (player.isHoldingAbility) {
            this.spendStamina(player, this.ABILITY_DRAIN_PER_TICK);
            if (player.stamina <= 0) {
                player.isHoldingAbility = false; // Stamina tugasa majburiy o'chadi
                // DIQQAT: personajning effektini (tezlik/ko'rinmaslik/muzlatish) bekor qilish
                // GameEngine ichida amalga oshiriladi, chunki bu yerda charLogic'ga
                // to'g'ridan-to'g'ri kirish yo'q
            }
        }

        // MUHIM: endi tiklanish kechikishi FAQAT stamina haqiqatan sarflanganda
        // yangilanadi (spendStamina orqali), shunchaki tugma bosib turilgani uchun
        // emas. Aks holda: Enter tugmasi stamina tugagandan keyin ham bosib
        // turilsa (zarba bermasa ham), tiklanish abadiy bloklanib qolar edi.
        // Kislota tekkan (semiz elf): 2 soniya stamina umuman tiklanmaydi
        if ((player.acidTicks || 0) > 0) {
            player.acidTicks!--;
        } else if (player.staminaRegenDelay > 0) {
            player.staminaRegenDelay--;
        } else if (player.stamina < (player.maxStamina || 100)) {
            // "Stamina" ko'nikmasi tiklanishni ham tezlashtiradi: har daraja +20% (max +100%)
            const regen = this.STAMINA_REGEN_PER_TICK * (1 + this.staminaLevelOf(player) * 0.2);
            player.stamina = Math.min(player.maxStamina || 100, player.stamina + regen);
        }
    }

    // Stamina sarflanganda shu yerdan chaqiriladi - tiklanish kechikishini ham
    // avtomatik yangilaydi (haqiqiy sarflanish bo'lmasa, tiklanish bloklanmaydi)
    // Hisobdagi "stamina" ko'nikma darajasi sarfni kamaytiradi (har daraja -10%, max -50%)
    public static spendStamina(player: PlayerState, amount: number): void {
        player.stamina = Math.max(0, player.stamina - this.staminaCost(player, amount));
        player.staminaRegenDelay = this.REGEN_DELAY_TICKS;
    }

    private static staminaLevelOf(player: PlayerState): number {
        return Math.max(0, Math.min(player.staminaLevel || 0, 5));
    }

    // Ko'nikma hisobga olingan HAQIQIY narx - hujumga yetadimi degan tekshiruv ham shunga qarashi
    // kerak (aks holda yaxshilangan qahramon ham to'liq narx to'planguncha hujum qila olmasdi)
    public static staminaCost(player: PlayerState, amount: number): number {
        return amount * (1 - this.staminaLevelOf(player) * 0.1);
    }

    // Hujum qilish mumkinmi (masalan, drobovik qayta o'qlanayotganda - yo'q). Standart - ha
    public canAttack(_player: PlayerState): boolean { return true; }

    // Har bir personaj o'zicha hujum qiladi (Abstract funksiyalar)
    abstract handleAttack(player: PlayerState, room: RoomState, angle: number): void;

    // SHIFT ushlab turilgancha, har tikda chaqiriladi (masalan: ko'rinmaslik, tezlik, muzlatish)
    abstract applyHeldAbility(player: PlayerState, room: RoomState): void;

    // SHIFT qo'yib yuborilganda yoki stamina tugaganda, effektni bekor qilish uchun chaqiriladi
    abstract releaseHeldAbility(player: PlayerState, room: RoomState): void;
}