import json
import math
import random
import sys
from array import array
from pathlib import Path

import pygame


pygame.mixer.pre_init(44100, -16, 1, 512)
pygame.init()

WIDTH, HEIGHT = 900, 700
SCREEN = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Neon Arcade: Rock Paper Scissors")
CLOCK = pygame.time.Clock()

BASE_DIR = Path(__file__).resolve().parent
LEGACY_STATS_FILE = BASE_DIR / "a_stats.json"
SLOT_FILES = [
    LEGACY_STATS_FILE,
    BASE_DIR / "a_stats_slot2.json",
    BASE_DIR / "a_stats_slot3.json",
]

STAT_KEYS = (
    "streak",
    "best_streak",
    "wins",
    "losses",
    "ties",
    "total_games",
    "rock_plays",
    "paper_plays",
    "scissors_plays",
    "rock_wins",
    "paper_wins",
    "scissors_wins",
    "double_wins",
    "double_losses",
    "critical_wins",
)

CHOICES = ["Rock", "Paper", "Scissors"]
BEATS = {"Rock": "Scissors", "Paper": "Rock", "Scissors": "Paper"}
COUNTERS = {"Rock": "Paper", "Paper": "Scissors", "Scissors": "Rock"}


def get_font(size, bold=False):
    return pygame.font.SysFont("Helvetica", size, bold=bold)


FONT_XS = get_font(14)
FONT_SM = get_font(18)
FONT_MD = get_font(26, bold=True)
FONT_LG = get_font(40, bold=True)
FONT_XL = get_font(56, bold=True)


THEMES = [
    {
        "name": "Neon",
        "bg": (14, 15, 22),
        "panel": (23, 24, 35),
        "text": (240, 244, 255),
        "muted": (110, 115, 140),
        "btn_base": (32, 34, 50),
        "win": (0, 230, 130),
        "lose": (255, 60, 90),
        "tie": (255, 200, 0),
        "crit": (186, 85, 211),
        "fire": (255, 100, 0),
        "cyan": (0, 210, 255),
    },
    {
        "name": "Terminal",
        "bg": (5, 15, 12),
        "panel": (12, 31, 25),
        "text": (218, 255, 232),
        "muted": (93, 148, 122),
        "btn_base": (18, 48, 38),
        "win": (58, 255, 132),
        "lose": (255, 92, 92),
        "tie": (210, 255, 105),
        "crit": (100, 235, 255),
        "fire": (255, 174, 66),
        "cyan": (90, 220, 255),
    },
    {
        "name": "Arcade",
        "bg": (18, 10, 28),
        "panel": (35, 22, 48),
        "text": (255, 246, 230),
        "muted": (155, 130, 175),
        "btn_base": (49, 32, 67),
        "win": (69, 255, 190),
        "lose": (255, 72, 128),
        "tie": (255, 212, 79),
        "crit": (238, 112, 255),
        "fire": (255, 132, 61),
        "cyan": (82, 221, 255),
    },
]


ACHIEVEMENTS = {
    "first_win": ("First Spark", "Win your first round."),
    "streak_5": ("Hot Hands", "Reach a 5 streak."),
    "streak_10": ("Neon Legend", "Reach a 10 streak."),
    "first_crit": ("Critical Signal", "Hit a critical win."),
    "double_win": ("Risk Taker", "Win Double or Nothing."),
    "ten_wins": ("Arcade Regular", "Reach 10 total wins."),
    "all_moves": ("Full Arsenal", "Win with Rock, Paper, and Scissors."),
}


def make_tone(frequency, duration_ms, volume=0.25):
    if not pygame.mixer.get_init():
        return None
    sample_rate = pygame.mixer.get_init()[0]
    sample_count = int(sample_rate * duration_ms / 1000)
    samples = array("h")
    amplitude = int(32767 * volume)
    for idx in range(sample_count):
        wave = math.sin(2 * math.pi * frequency * idx / sample_rate)
        samples.append(int(amplitude * wave))
    return pygame.mixer.Sound(buffer=samples.tobytes())


SOUNDS = {
    "win": make_tone(740, 110),
    "lose": make_tone(180, 170),
    "tie": make_tone(440, 95),
    "crit": make_tone(980, 220),
    "double": make_tone(1180, 180),
    "click": make_tone(520, 55, 0.16),
    "achievement": make_tone(1320, 260),
}


def play_sound(name):
    sound = SOUNDS.get(name)
    if sound:
        try:
            sound.play()
        except pygame.error:
            pass


class ArcadeRPS:
    def __init__(self):
        self.slot_index = 0
        self.theme_index = 0
        self.difficulty_index = 0
        self.difficulties = ["Random", "Habit AI", "Mercy AI"]
        self.theme = THEMES[self.theme_index]

        self.streak = 0
        self.best_streak = 0
        self.wins = 0
        self.losses = 0
        self.ties = 0
        self.total_games = 0
        self.rock_plays = 0
        self.paper_plays = 0
        self.scissors_plays = 0
        self.rock_wins = 0
        self.paper_wins = 0
        self.scissors_wins = 0
        self.double_wins = 0
        self.double_losses = 0
        self.critical_wins = 0

        self.achievements = []
        self.recent_moves = []
        self.player_move = None
        self.ai_move = None
        self.result_msg = "CHOOSE YOUR WEAPON"
        self.result_color_key = "text"
        self.sub_text = ""
        self.sub_color_key = "text"
        self.can_double = False
        self.show_stats = False
        self.paused = False
        self.confirm_reset = False

        self.flash_bg = list(self.theme["bg"])
        self.shake_intensity = 0
        self.pop_y = 0
        self.pop_alpha = 0
        self.pop_text = ""
        self.pop_color_key = "win"
        self.achievement_timer = 0
        self.achievement_text = ""
        self.save_notice_timer = 0
        self.combo_pulse = 0
        self.crit_active = False
        self.crit_timer = 0
        self.stars = [
            [random.randrange(WIDTH), random.randrange(HEIGHT), random.uniform(0.4, 1.8)]
            for _ in range(70)
        ]

        self.stats_btn_rect = pygame.Rect(760, 22, 110, 34)
        self.reset_btn_rect = pygame.Rect(640, 22, 105, 34)
        self.slot_btn_rect = pygame.Rect(25, 22, 95, 34)
        self.theme_btn_rect = pygame.Rect(130, 22, 110, 34)
        self.mode_btn_rect = pygame.Rect(250, 22, 120, 34)
        self.pause_btn_rect = pygame.Rect(380, 22, 90, 34)
        self.double_btn_rect = pygame.Rect(325, 455, 250, 45)
        self.buttons = {
            "Rock": {"rect": pygame.Rect(140, 540, 180, 80), "scale": 1.0, "color_key": "win"},
            "Paper": {"rect": pygame.Rect(360, 540, 180, 80), "scale": 1.0, "color_key": "tie"},
            "Scissors": {"rect": pygame.Rect(580, 540, 180, 80), "scale": 1.0, "color_key": "lose"},
        }

        self.load_stats()

    def color(self, key):
        return self.theme[key]

    def default_stats(self):
        stats = {key: 0 for key in STAT_KEYS}
        stats.update(
            {
                "achievements": [],
                "theme_index": 0,
                "difficulty_index": 0,
                "recent_moves": [],
            }
        )
        return stats

    def stats_path(self):
        return SLOT_FILES[self.slot_index]

    def clean_stat_value(self, stats, key):
        value = stats.get(key, 0)
        if isinstance(value, bool):
            return 0
        if isinstance(value, int):
            return max(0, value)
        if isinstance(value, str) and value.strip().isdigit():
            return int(value.strip())
        return 0

    def repair_stats_file(self, stats):
        repaired = {key: self.clean_stat_value(stats, key) for key in STAT_KEYS}
        repaired["achievements"] = [
            item for item in stats.get("achievements", []) if item in ACHIEVEMENTS
        ]
        repaired["theme_index"] = self.clean_stat_value(stats, "theme_index") % len(THEMES)
        repaired["difficulty_index"] = self.clean_stat_value(stats, "difficulty_index") % len(self.difficulties)
        repaired["recent_moves"] = [
            move for move in stats.get("recent_moves", []) if move in CHOICES
        ][-12:]
        max_possible_streak = max(repaired["best_streak"], repaired["total_games"] * 3)
        if repaired["streak"] > max_possible_streak:
            repaired["streak"] = repaired["best_streak"]
        if repaired["best_streak"] < repaired["streak"]:
            repaired["best_streak"] = repaired["streak"]
        return repaired

    def load_stats(self):
        stats = self.default_stats()
        path = self.stats_path()
        if path.exists():
            try:
                loaded_stats = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(loaded_stats, dict):
                    stats = self.repair_stats_file(loaded_stats)
                else:
                    self.backup_bad_stats_file(path)
            except (OSError, json.JSONDecodeError):
                self.backup_bad_stats_file(path)
        for key in STAT_KEYS:
            setattr(self, key, stats[key])
        self.achievements = stats["achievements"]
        self.recent_moves = stats["recent_moves"]
        self.theme_index = stats["theme_index"]
        self.difficulty_index = stats["difficulty_index"]
        self.theme = THEMES[self.theme_index]
        self.flash_bg = list(self.theme["bg"])
        self.result_msg = f"SLOT {self.slot_index + 1} READY"
        self.result_color_key = "cyan"
        self.sub_text = self.difficulties[self.difficulty_index]
        self.sub_color_key = "muted"
        self.save_stats()

    def backup_bad_stats_file(self, path):
        if not path.exists():
            return
        backup_path = path.with_suffix(".bad.json")
        try:
            backup_path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        except OSError:
            pass

    def save_stats(self):
        stats = {key: getattr(self, key) for key in STAT_KEYS}
        stats.update(
            {
                "achievements": self.achievements,
                "theme_index": self.theme_index,
                "difficulty_index": self.difficulty_index,
                "recent_moves": self.recent_moves[-12:],
            }
        )
        try:
            self.stats_path().write_text(json.dumps(stats, indent=2), encoding="utf-8")
            self.save_notice_timer = 90
        except OSError:
            pass

    def switch_slot(self):
        play_sound("click")
        self.save_stats()
        self.slot_index = (self.slot_index + 1) % len(SLOT_FILES)
        self.player_move = None
        self.ai_move = None
        self.can_double = False
        self.confirm_reset = False
        self.load_stats()

    def cycle_theme(self):
        play_sound("click")
        self.theme_index = (self.theme_index + 1) % len(THEMES)
        self.theme = THEMES[self.theme_index]
        self.flash_bg = list(self.theme["bg"])
        self.result_msg = f"{self.theme['name'].upper()} THEME"
        self.result_color_key = "cyan"
        self.save_stats()

    def cycle_difficulty(self):
        play_sound("click")
        self.difficulty_index = (self.difficulty_index + 1) % len(self.difficulties)
        self.result_msg = self.difficulties[self.difficulty_index].upper()
        self.result_color_key = "cyan"
        self.sub_text = "AI MODE CHANGED"
        self.sub_color_key = "muted"
        self.save_stats()

    def request_reset(self):
        play_sound("click")
        if not self.confirm_reset:
            self.confirm_reset = True
            self.result_msg = "CONFIRM RESET?"
            self.result_color_key = "lose"
            self.sub_text = "Press R or Reset again"
            self.sub_color_key = "tie"
            return
        self.reset_stats()

    def reset_stats(self):
        for key in STAT_KEYS:
            setattr(self, key, 0)
        self.achievements = []
        self.recent_moves = []
        self.player_move = None
        self.ai_move = None
        self.can_double = False
        self.confirm_reset = False
        self.result_msg = "STATS RESET"
        self.result_color_key = "cyan"
        self.sub_text = "FRESH RUN READY"
        self.sub_color_key = "text"
        self.flash_bg[:] = (10, 45, 60)
        self.trigger_popup("RESET", "cyan")
        self.save_stats()

    def choose_ai_move(self):
        mode = self.difficulties[self.difficulty_index]
        if mode == "Habit AI" and self.recent_moves:
            favorite = max(CHOICES, key=self.recent_moves.count)
            return COUNTERS[favorite] if random.random() < 0.65 else random.choice(CHOICES)
        if mode == "Mercy AI" and self.streak == 0 and random.random() < 0.45:
            return BEATS[random.choice(CHOICES)]
        return random.choice(CHOICES)

    def unlock(self, achievement_id):
        if achievement_id in self.achievements:
            return
        self.achievements.append(achievement_id)
        title = ACHIEVEMENTS[achievement_id][0]
        self.achievement_text = f"ACHIEVEMENT: {title}"
        self.achievement_timer = 180
        play_sound("achievement")

    def check_achievements(self):
        if self.wins >= 1:
            self.unlock("first_win")
        if self.streak >= 5:
            self.unlock("streak_5")
        if self.streak >= 10:
            self.unlock("streak_10")
        if self.critical_wins >= 1:
            self.unlock("first_crit")
        if self.double_wins >= 1:
            self.unlock("double_win")
        if self.wins >= 10:
            self.unlock("ten_wins")
        if self.rock_wins and self.paper_wins and self.scissors_wins:
            self.unlock("all_moves")

    def play_round(self, player_choice):
        if self.paused:
            return
        self.confirm_reset = False
        self.player_move = player_choice
        self.ai_move = self.choose_ai_move()
        self.total_games += 1
        self.recent_moves.append(player_choice)
        self.recent_moves = self.recent_moves[-12:]
        setattr(self, f"{player_choice.lower()}_plays", getattr(self, f"{player_choice.lower()}_plays") + 1)
        self.can_double = False
        self.sub_text = ""
        self.crit_active = False
        is_crit = random.random() < 0.01

        if self.player_move == self.ai_move:
            self.ties += 1
            self.result_msg = "SYSTEM TIE"
            self.result_color_key = "tie"
            self.flash_bg[:] = (40, 38, 30)
            play_sound("tie")
        elif BEATS[self.player_move] == self.ai_move:
            old_streak = self.streak
            self.wins += 1
            setattr(self, f"{player_choice.lower()}_wins", getattr(self, f"{player_choice.lower()}_wins") + 1)
            if is_crit:
                self.streak += 3
                self.critical_wins += 1
                self.result_msg = "CRITICAL WIN! (+3)"
                self.result_color_key = "crit"
                self.crit_active = True
                self.crit_timer = 0
                self.trigger_popup("+3 CRIT!", "crit")
                play_sound("crit")
            else:
                self.streak += 1
                self.result_msg = "YOU WIN!"
                self.result_color_key = "win"
                self.flash_bg[:] = (12, 55, 32)
                self.trigger_popup("+1 STREAK", "win")
                self.can_double = True
                play_sound("win")
            if old_streak == 0:
                self.sub_text = "CLUTCH MOMENT! STREAK BREAK THROUGH!"
                self.sub_color_key = "tie"
            if self.streak > self.best_streak:
                self.best_streak = self.streak
        else:
            self.losses += 1
            self.streak = 0
            self.result_msg = "AI WINS!"
            self.result_color_key = "lose"
            self.flash_bg[:] = (60, 20, 28)
            self.shake_intensity = 14
            play_sound("lose")

        self.check_achievements()
        self.save_stats()

    def resolve_double_or_nothing(self):
        if self.paused or not self.can_double:
            return
        self.confirm_reset = False
        self.can_double = False
        self.total_games += 1
        self.sub_text = ""
        if random.random() < 0.50:
            self.streak *= 2
            self.wins += 1
            self.double_wins += 1
            self.result_msg = "DOUBLE SUCCESS!"
            self.result_color_key = "win"
            self.flash_bg[:] = (0, 80, 50)
            self.trigger_popup("DOUBLE!", "tie")
            play_sound("double")
            if self.streak > self.best_streak:
                self.best_streak = self.streak
        else:
            self.streak = 0
            self.losses += 1
            self.double_losses += 1
            self.result_msg = "DOUBLE FAILED! BUSTED"
            self.result_color_key = "lose"
            self.flash_bg[:] = (90, 10, 20)
            self.shake_intensity = 22
            play_sound("lose")
        self.check_achievements()
        self.save_stats()

    def trigger_popup(self, text, color_key):
        self.pop_text = text
        self.pop_color_key = color_key
        self.pop_y = 120
        self.pop_alpha = 255

    def update(self):
        if not self.crit_active:
            for i in range(3):
                self.flash_bg[i] += (self.color("bg")[i] - self.flash_bg[i]) * 0.1
        else:
            self.crit_timer += 1
            if self.crit_timer > 120:
                self.crit_active = False
        if self.shake_intensity > 0:
            self.shake_intensity *= 0.85
        self.combo_pulse += 0.08
        for star in self.stars:
            star[1] += star[2]
            if star[1] > HEIGHT:
                star[0] = random.randrange(WIDTH)
                star[1] = 0
                star[2] = random.uniform(0.4, 1.8)
        if self.save_notice_timer > 0:
            self.save_notice_timer -= 1
        if self.achievement_timer > 0:
            self.achievement_timer -= 1
        if self.pop_alpha > 0:
            self.pop_y -= 2
            self.pop_alpha -= 6

    def draw_button(self, surface, rect, label, active=False, danger=False):
        mouse_pos = pygame.mouse.get_pos()
        hovered = rect.collidepoint(mouse_pos)
        if danger and hovered:
            fill = self.color("lose")
            text_color = self.color("bg")
        elif active or hovered:
            fill = self.color("win") if active else self.color("btn_base")
            text_color = self.color("bg") if active else self.color("text")
        else:
            fill = self.color("panel")
            text_color = self.color("text")
        pygame.draw.rect(surface, fill, rect, border_radius=8)
        label_surf = FONT_XS.render(label, True, text_color)
        surface.blit(label_surf, (rect.centerx - label_surf.get_width() // 2, rect.centery - label_surf.get_height() // 2))

    def draw(self, surface):
        sx = random.randint(-int(self.shake_intensity), int(self.shake_intensity)) if self.shake_intensity > 0 else 0
        sy = random.randint(-int(self.shake_intensity), int(self.shake_intensity)) if self.shake_intensity > 0 else 0

        if self.crit_active:
            r = int((math.sin(self.crit_timer * 0.15) + 1.0) * 0.5 * 40 + 35)
            g = int((math.sin(self.crit_timer * 0.15 + 2) + 1.0) * 0.5 * 25 + 15)
            b = int((math.sin(self.crit_timer * 0.15 + 4) + 1.0) * 0.5 * 50 + 45)
            surface.fill((r, g, b))
        else:
            surface.fill([int(c) for c in self.flash_bg])

        for x, y, speed in self.stars:
            brightness = 70 + int(speed * 60)
            pygame.draw.circle(surface, (brightness, brightness, min(255, brightness + 35)), (int(x), int(y)), 1)

        is_hot = self.streak >= 5
        streak_theme = self.color("fire") if is_hot else (self.color("win") if self.streak > 0 else self.color("text"))
        lbl_streak = FONT_SM.render("HOT STREAK" if is_hot else "CURRENT STREAK", True, streak_theme)
        val_streak = FONT_XL.render(str(self.streak), True, streak_theme)
        surface.blit(lbl_streak, (WIDTH // 2 - lbl_streak.get_width() // 2 + sx, 66 + sy))
        surface.blit(val_streak, (WIDTH // 2 - val_streak.get_width() // 2 + sx, 90 + sy))
        if self.streak >= 3:
            ring_size = 72 + int(math.sin(self.combo_pulse) * 5)
            ring_rect = pygame.Rect(0, 0, ring_size, ring_size)
            ring_rect.center = (WIDTH // 2 + sx, 122 + sy)
            pygame.draw.ellipse(surface, streak_theme, ring_rect, width=2)

        self.draw_button(surface, self.slot_btn_rect, f"Slot {self.slot_index + 1}")
        self.draw_button(surface, self.theme_btn_rect, self.theme["name"])
        self.draw_button(surface, self.mode_btn_rect, self.difficulties[self.difficulty_index])
        self.draw_button(surface, self.pause_btn_rect, "Paused" if self.paused else "Pause", active=self.paused)
        self.draw_button(surface, self.reset_btn_rect, "Confirm" if self.confirm_reset else "Reset", danger=True)
        self.draw_button(surface, self.stats_btn_rect, "Stats HUD", active=self.show_stats)

        if self.pop_alpha > 0:
            pop_surf = FONT_MD.render(self.pop_text, True, self.color(self.pop_color_key))
            pop_surf.set_alpha(max(0, self.pop_alpha))
            surface.blit(pop_surf, (WIDTH // 2 + 75, self.pop_y))

        y_cards = 190
        pygame.draw.rect(surface, self.color("panel"), (140 + sx, y_cards + sy, 240, 160), border_radius=15)
        p_title = FONT_SM.render("PLAYER CHOOSES", True, self.color("muted"))
        p_choice_txt = FONT_MD.render(str(self.player_move if self.player_move else "-"), True, self.color("text"))
        surface.blit(p_title, (260 - p_title.get_width() // 2 + sx, y_cards + 25 + sy))
        surface.blit(p_choice_txt, (260 - p_choice_txt.get_width() // 2 + sx, y_cards + 80 + sy))

        vs_txt = FONT_MD.render("VS", True, self.color("muted"))
        surface.blit(vs_txt, (WIDTH // 2 - vs_txt.get_width() // 2 + sx, y_cards + 65 + sy))

        pygame.draw.rect(surface, self.color("panel"), (520 + sx, y_cards + sy, 240, 160), border_radius=15)
        ai_title = FONT_SM.render("AI SYSTEM CHOOSES", True, self.color("muted"))
        ai_choice_txt = FONT_MD.render(str(self.ai_move if self.ai_move else "-"), True, self.color("text"))
        surface.blit(ai_title, (640 - ai_title.get_width() // 2 + sx, y_cards + 25 + sy))
        surface.blit(ai_choice_txt, (640 - ai_choice_txt.get_width() // 2 + sx, y_cards + 80 + sy))

        result_surf = FONT_LG.render(self.result_msg, True, self.color(self.result_color_key))
        surface.blit(result_surf, (WIDTH // 2 - result_surf.get_width() // 2 + sx, 365 + sy))
        if self.sub_text:
            sub_surf = FONT_SM.render(self.sub_text, True, self.color(self.sub_color_key))
            surface.blit(sub_surf, (WIDTH // 2 - sub_surf.get_width() // 2, 415))

        if self.can_double:
            d_hover = self.double_btn_rect.collidepoint(pygame.mouse.get_pos())
            pygame.draw.rect(surface, self.color("tie") if d_hover else self.color("panel"), self.double_btn_rect, border_radius=8)
            pygame.draw.rect(surface, self.color("tie"), self.double_btn_rect, width=2, border_radius=8)
            d_txt = FONT_SM.render("RISK: DOUBLE OR NOTHING", True, self.color("bg") if d_hover else self.color("tie"))
            surface.blit(d_txt, (self.double_btn_rect.centerx - d_txt.get_width() // 2, self.double_btn_rect.centery - d_txt.get_height() // 2))

        for name, data in self.buttons.items():
            rect = data["rect"]
            hovered = rect.collidepoint(pygame.mouse.get_pos())
            target_scale = 1.06 if hovered else 1.0
            data["scale"] += (target_scale - data["scale"]) * 0.2
            w = int(rect.width * data["scale"])
            h = int(rect.height * data["scale"])
            scaled_rect = pygame.Rect(rect.centerx - w // 2, rect.centery - h // 2, w, h)
            button_color = self.color(data["color_key"])
            pygame.draw.rect(surface, self.color("btn_base") if not hovered else button_color, scaled_rect, border_radius=12)
            pygame.draw.rect(surface, button_color, scaled_rect, width=2, border_radius=12)
            btn_txt = FONT_MD.render(name, True, self.color("text") if not hovered else self.color("bg"))
            key_txt = FONT_SM.render({"Rock": "1", "Paper": "2", "Scissors": "3"}[name], True, self.color("muted") if not hovered else self.color("bg"))
            surface.blit(btn_txt, (scaled_rect.centerx - btn_txt.get_width() // 2, scaled_rect.centery - btn_txt.get_height() // 2))
            surface.blit(key_txt, (scaled_rect.right - 24, scaled_rect.top + 8))

        help_text = "1 Rock  2 Paper  3 Scissors  D Double  H Stats  M Mode  T Theme  P Slot  Space Pause  R Reset"
        help_surf = FONT_XS.render(help_text, True, self.color("muted"))
        surface.blit(help_surf, (WIDTH // 2 - help_surf.get_width() // 2, 654))
        if self.save_notice_timer > 0:
            save_txt = FONT_SM.render("SAVED", True, self.color("cyan"))
            save_txt.set_alpha(min(255, self.save_notice_timer * 4))
            surface.blit(save_txt, (WIDTH // 2 - save_txt.get_width() // 2, 628))
        if self.achievement_timer > 0:
            ach_surf = FONT_SM.render(self.achievement_text, True, self.color("crit"))
            surface.blit(ach_surf, (WIDTH // 2 - ach_surf.get_width() // 2, 152))

        if self.show_stats:
            panel_rect = pygame.Rect(WIDTH - 266, 68, 246, 318)
            pygame.draw.rect(surface, self.color("panel"), panel_rect, border_radius=12)
            pygame.draw.rect(surface, self.color("win"), panel_rect, width=2, border_radius=12)
            move_rates = [
                f"Rock W/R: {self.rock_wins}/{self.rock_plays}",
                f"Paper W/R: {self.paper_wins}/{self.paper_plays}",
                f"Scissors W/R: {self.scissors_wins}/{self.scissors_plays}",
            ]
            lines = [
                f"Best Streak: {self.best_streak}",
                f"Total Games: {self.total_games}",
                f"Total Wins: {self.wins}",
                f"Total Losses: {self.losses}",
                f"Total Ties: {self.ties}",
                f"Win Rate: {((self.wins / self.total_games) * 100) if self.total_games else 0:.1f}%",
                f"Doubles: {self.double_wins}W / {self.double_losses}L",
                f"Crit Wins: {self.critical_wins}",
                f"Badges: {len(self.achievements)}/{len(ACHIEVEMENTS)}",
                *move_rates,
            ]
            for idx, line in enumerate(lines):
                txt_color = self.color("win") if idx == 0 else self.color("text")
                line_surf = FONT_XS.render(line, True, txt_color)
                surface.blit(line_surf, (panel_rect.x + 18, panel_rect.y + 18 + idx * 24))

        if self.paused:
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 150))
            surface.blit(overlay, (0, 0))
            pause_title = FONT_LG.render("PAUSED", True, self.color("cyan"))
            pause_body = FONT_SM.render("Space resumes. Use T/M/P to change theme, mode, and save slot.", True, self.color("text"))
            surface.blit(pause_title, (WIDTH // 2 - pause_title.get_width() // 2, 285))
            surface.blit(pause_body, (WIDTH // 2 - pause_body.get_width() // 2, 340))

    def handle_click(self, pos):
        if self.slot_btn_rect.collidepoint(pos):
            self.switch_slot()
        elif self.theme_btn_rect.collidepoint(pos):
            self.cycle_theme()
        elif self.mode_btn_rect.collidepoint(pos):
            self.cycle_difficulty()
        elif self.pause_btn_rect.collidepoint(pos):
            self.paused = not self.paused
            play_sound("click")
        elif self.stats_btn_rect.collidepoint(pos):
            self.show_stats = not self.show_stats
            play_sound("click")
        elif self.reset_btn_rect.collidepoint(pos):
            self.request_reset()
        elif self.can_double and self.double_btn_rect.collidepoint(pos):
            self.resolve_double_or_nothing()
        else:
            for name, data in self.buttons.items():
                if data["rect"].collidepoint(pos):
                    self.play_round(name)

    def handle_key(self, key):
        if key == pygame.K_ESCAPE:
            self.confirm_reset = False
            self.paused = False
        elif key == pygame.K_SPACE:
            self.paused = not self.paused
            play_sound("click")
        elif key == pygame.K_1:
            self.play_round("Rock")
        elif key == pygame.K_2:
            self.play_round("Paper")
        elif key == pygame.K_3:
            self.play_round("Scissors")
        elif key == pygame.K_d:
            self.resolve_double_or_nothing()
        elif key == pygame.K_h:
            self.show_stats = not self.show_stats
            play_sound("click")
        elif key == pygame.K_r:
            self.request_reset()
        elif key == pygame.K_t:
            self.cycle_theme()
        elif key == pygame.K_m:
            self.cycle_difficulty()
        elif key == pygame.K_p:
            self.switch_slot()


def main():
    game = ArcadeRPS()
    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                game.save_stats()
                pygame.quit()
                sys.exit()
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                game.handle_click(pygame.mouse.get_pos())
            if event.type == pygame.KEYDOWN:
                game.handle_key(event.key)

        game.update()
        game.draw(SCREEN)
        pygame.display.flip()
        CLOCK.tick(60)


if __name__ == "__main__":
    main()
