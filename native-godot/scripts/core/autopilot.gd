# ============================================================
# autopilot.gd — کنترل‌گر سطح پایین (مغز اینستراکتور و هوش مصنوعی)
#   • turn_hold: چرخش بانک‌دار با G هدف (مثل خلبان واقعی)
#   • level_hold: پرواز تراز
#   • pursue: تعقیب نقطه/هدف — خروجی ورودی pitch/roll/yaw
# کلاس خالص — تست‌پذیر headless
# ============================================================
class_name Autopilot

const DEG := PI / 180.0

# بانک علامت‌دار: مثبت = بانک راست
static func signed_bank(st: Dictionary) -> float:
	var right_b: Vector3 = st.quat * Vector3.RIGHT
	var up_b: Vector3 = st.quat * Vector3.UP
	return atan2(-right_b.y, maxf(up_b.y, -1.0))

# زاویه بانک مطلق
static func bank_abs(st: Dictionary) -> float:
	var up_b: Vector3 = st.quat * Vector3.UP
	return atan2(sqrt(1.0 - clampf(up_b.y * up_b.y, 0.0, 1.0)), up_b.y)

# ---------- نگه‌داشتن بانک + G هدف ----------
# ورودی inp تغییر می‌کند (pitch/roll)
static func turn_hold(st: Dictionary, inp: Dictionary, bank_deg: float, g_target: float) -> void:
	var err: float = bank_deg * DEG - signed_bank(st)
	inp.roll = clampf(err * 1.6 + st.ang.z * 0.35, -1.0, 1.0)  # دمپر: مقاومت در برابر نرخ غلتش
	inp.pitch = clampf(0.68 * (g_target / 5.5) + (g_target - st.gFilt) * 0.07, -0.4, 1.0)

# ---------- پرواز تراز با بانک صفر ----------
static func level_hold(st: Dictionary, inp: Dictionary) -> void:
	var fwd: Vector3 = st.quat * Vector3.FORWARD
	var pitch_att: float = asin(clampf(fwd.y, -1.0, 1.0))
	# ارتفاع → دماغه؛ نرخ عمودی → اصلاح
	var vs: float = st.vel.y
	var want_pitch_att: float = clampf(-vs * 0.012, -0.25, 0.25)
	inp.pitch = clampf((want_pitch_att - pitch_att) * 2.2 - st.ang.x * 0.3, -1.0, 1.0)
	inp.roll = clampf(signed_bank(st) * -1.8 - st.ang.z * 0.3, -1.0, 1.0)
	inp.yaw = 0.0
