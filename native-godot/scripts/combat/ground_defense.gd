# ============================================================
# ground_defense.gd — پدافند زمینی: SAM (موشک هدایت‌شونده) + AAA (فلک)
# ============================================================
class_name GroundDefense
extends RefCounted

var sam_sites: Array = []     # {pos, cd, mesh}
var aaa_sites: Array = []     # {pos, cd, mesh}
var enabled := false
var weapons = null
var effects: Effects
var terrain: Terrain
var game = null

const SAM_RANGE := 5500.0
const SAM_RELOAD := 9.0
const AAA_RANGE := 2400.0
const AAA_RELOAD := 1.4

func _init(terr: Terrain, fx: Effects, wpns) -> void:
	terrain = terr
	effects = fx
	weapons = wpns
	# سایت‌ها دور بیس دشمن
	var rng := RandomNumberGenerator.new()
	rng.seed = 31
	for i in 3:
		var ang := i / 3.0 * TAU + 0.5
		var px := Terrain.ENEMY.x + cos(ang) * 520.0
		var pz := Terrain.ENEMY.z + sin(ang) * 520.0
		var py := terrain.ground_height(px, pz)
		sam_sites.append({"pos": Vector3(px, py + 3, pz), "cd": 2.0 + i * 2.0})
	for i in 3:
		var ang := i / 3.0 * TAU + 2.2
		var px := Terrain.ENEMY.x + cos(ang) * 340.0
		var pz := Terrain.ENEMY.z + sin(ang) * 340.0
		var py := terrain.ground_height(px, pz)
		aaa_sites.append({"pos": Vector3(px, py + 3.4, pz), "cd": 1.0 + i})

func update(dt: float, aircraft_list: Array) -> void:
	if not enabled or weapons == null:
		return
	for s in sam_sites:
		s.cd -= dt
		if s.cd <= 0.0:
			for ac in aircraft_list:
				if not ac.alive or ac.team == "blue":
					continue  # SAM فقط متحدان؟ نه — بازیکن آبی است؛ دشمن قرمز... SAM به آبی شلیک کند
			# هدف: نزدیک‌ترین آبی در برد
			var tgt: Aircraft = null
			var bd := SAM_RANGE
			for ac2 in aircraft_list:
				if not ac2.alive or ac2.team != "blue":
					continue
				var d: float = ac2.global_position.distance_to(s.pos)
				if d < bd:
					bd = d
					tgt = ac2
			if tgt != null:
				s.cd = SAM_RELOAD
				weapons.launch_missile(s.pos, Vector3.ZERO, tgt, null, "sam", SAM_RANGE)
	for a in aaa_sites:
		a.cd -= dt
		if a.cd <= 0.0:
			var tgt2: Aircraft = null
			var bd2 := AAA_RANGE
			for ac3 in aircraft_list:
				if not ac3.alive or ac3.team != "blue":
					continue
				var d2: float = ac3.global_position.distance_to(a.pos)
				if d2 < bd2:
					bd2 = d2
					tgt2 = ac3
			if tgt2 != null:
				a.cd = AAA_RELOAD
				_flak(a.pos, tgt2)

func _flak(pos: Vector3, tgt: Aircraft) -> void:
	# انفجار فلک نزدیک مسیر هدف
	var lead: Vector3 = tgt.global_position + tgt.st.vel * randf_range(0.6, 1.4)
	var burst: Vector3 = lead + Vector3(randf_range(-40, 40), randf_range(-25, 25), randf_range(-40, 40))
	if effects != null:
		effects.explosion(burst, 0.8)
	var d := tgt.global_position.distance_to(burst)
	if d < 45.0 and randf() < 0.5:
		tgt.take_hit(16.0 * (1.0 - d / 50.0), null)
