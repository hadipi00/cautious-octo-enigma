# ============================================================
# isa.gd — اتمسفر استاندارد بین‌المللی (ISA)
# چگالی/فشار/دما/سرعت صوت بر حسب ارتفاع — فیزیک واقعی
# ============================================================
class_name ISA

const T0 := 288.15        # K
const P0 := 101325.0      # Pa
const L := 0.0065         # K/m نرخ افت دما
const R := 287.0528       # J/(kg·K)
const GAMMA := 1.4
const G := 9.80665
const EXP_BARO := G / (R * L)   # ≈ 5.2559

# بازگشت: [دما K, فشار Pa, چگالی kg/m³, سرعت صوت m/s]
static func at(h_m: float) -> Array:
	var h: float = clampf(h_m, -500.0, 25000.0)
	var T: float
	var p: float
	if h < 11000.0:
		T = T0 - L * h
		p = P0 * pow(1.0 - L * h / T0, EXP_BARO)
	else:
		var T11 := T0 - L * 11000.0
		var p11 := P0 * pow(1.0 - L * 11000.0 / T0, EXP_BARO)
		T = T11
		p = p11 * exp(-G * (h - 11000.0) / (R * T11))
	var rho := p / (R * T)
	var a := sqrt(GAMMA * R * T)
	return [T, p, rho, a]

static func density(h_m: float) -> float:
	return at(h_m)[2]

static func sound_speed(h_m: float) -> float:
	return at(h_m)[3]

static func rho_ratio(h_m: float) -> float:
	return at(h_m)[2] / (P0 / (R * T0))
