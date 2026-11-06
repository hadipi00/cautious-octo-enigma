class_name JetBuilder
extends RefCounted
## مدل‌ساز پارامتریک جنگنده — از داده، مش low-poly با سیلوئت واقعی
## محورها: دماغه −Z ، بالا +Y (قرارداد Godot)

static func build(v: Dictionary) -> Dictionary:
	var s: float = v.get("len", 15.0) / 15.0
	var span: float = v.get("span", 10.0)
	var root := Node3D.new()
	root.name = "JetMesh"

	var body_mat := _mat(Color(v.get("body", "#7f8d9d")))
	var dark_mat := _mat(Color(0.23, 0.25, 0.28), 0.5, 0.55)
	var glass := _mat(Color(0.08, 0.13, 0.20), 0.1, 1.0)
	var ab_mat := StandardMaterial3D.new()
	ab_mat.albedo_color = Color(1.0, 0.55, 0.15)
	ab_mat.emission_enabled = true
	ab_mat.emission = Color(1.0, 0.5, 0.1)
	ab_mat.emission_energy_multiplier = 4.0
	ab_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ab_mat.albedo_color.a = 0.8
	var ab_core := ab_mat.duplicate()
	ab_core.albedo_color = Color(1.0, 0.85, 0.6)
	ab_core.emission = Color(1.0, 0.8, 0.5)
	ab_core.albedo_color.a = 0.9

	# ---------- بدنه (چرخش پروفیل) ----------
	var prof := [
		Vector2(0.30, 7.5), Vector2(0.44, 6.2), Vector2(0.58, 4.0),
		Vector2(0.66, 1.5), Vector2(0.66, -0.8), Vector2(0.58, -3.2),
		Vector2(0.42, -5.6), Vector2(0.20, -6.9), Vector2(0.04, -7.42), Vector2(0.0, -7.5),
	]
	var fus := _revolve(prof, 14, s * v.get("fus_w", 1.0), body_mat)
	root.add_child(fus)

	# ---------- بال ----------
	var semi: float = span * 0.5 - 0.45 * s
	var wp: Dictionary = {
		"swept": {"root": 4.6, "tip": 1.5, "sw": 0.62, "z": 1.6},
		"delta": {"root": 6.8, "tip": 1.0, "sw": 0.85, "z": 0.8},
		"variable": {"root": 5.4, "tip": 2.0, "sw": 0.55, "z": 1.6},
	}.get(v.get("wing_type", "swept"))
	var wing_z: float = wp.z * s
	for side in [1.0, -1.0]:
		var w := _plank(wp.root * s, wp.tip * s, semi, wp.sw * semi, 0.10 * s, side, body_mat)
		w.position = Vector3(side * 0.42 * s, -0.12 * s, wing_z)
		root.add_child(w)

	# ---------- دم افقی ----------
	var h_semi := span * 0.20
	for side in [1.0, -1.0]:
		var st := _plank(2.0 * s, 0.8 * s, h_semi, h_semi * 0.55, 0.07 * s, side, body_mat)
		st.position = Vector3(side * 0.35 * s, 0.05 * s, -5.4 * s)
		root.add_child(st)

	# ---------- دم عمودی ----------
	var fin_h := 2.1 * s if v.get("tail_type", "single") == "twin" else 2.7 * s
	var fin_xs := [0.62 * s, -0.62 * s] if v.get("tail_type", "single") == "twin" else [0.0]
	for fx in fin_xs:
		var fin := _fin(3.1 * s, 1.0 * s, 1.6 * s, fin_h, 0.09 * s, body_mat)
		fin.position = Vector3(fx, 0.4 * s, -4.4 * s)
		root.add_child(fin)

	# ---------- کابین ----------
	var can := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.5 * s
	sm.height = 1.1 * s
	sm.radial_segments = 12
	sm.rings = 8
	can.mesh = sm
	can.material_override = glass
	can.scale = Vector3(1.0, 1.1, 3.6)
	can.position = Vector3(0, 0.48 * s, 2.9 * s)
	root.add_child(can)

	# ---------- ورودی هوا ----------
	if v.get("engines", 1) == 2:
		for side in [1.0, -1.0]:
			var it := _box(0.55 * s, 0.85 * s, 3.4 * s, body_mat)
			it.position = Vector3(side * 0.75 * s, -0.12 * s, 1.8 * s)
			root.add_child(it)
	else:
		var it2 := _box(0.9 * s, 0.7 * s, 2.4 * s, dark_mat)
		it2.position = Vector3(0, -0.44 * s, 2.6 * s)
		root.add_child(it2)

	# ---------- نازل و شعله افتربرنر ----------
	var ab_glows: Array[Node3D] = []
	var nz_r := 0.30 * s if v.get("engines", 1) == 2 else 0.34 * s
	var nz_xs: Array = [0.55 * s, -0.55 * s] if v.get("engines", 1) == 2 else [0.0]
	for nx in nz_xs:
		var noz := CylinderMesh.new()
		noz.top_radius = nz_r * 0.9
		noz.bottom_radius = nz_r
		noz.height = 0.8 * s
		var nozm := MeshInstance3D.new()
		nozm.mesh = noz
		nozm.material_override = dark_mat
		nozm.rotation.x = PI / 2.0
		nozm.position = Vector3(nx, 0, 7.2 * s)
		root.add_child(nozm)

		var glow := _cone(nz_r * 0.9, 2.6 * s, ab_mat)
		glow.rotation.x = PI / 2.0          # نوک مخروط به +Z (عقب)
		glow.position = Vector3(nx, 0, 7.6 * s + 1.3 * s)
		root.add_child(glow)
		ab_glows.append(glow)
		var core := _cone(nz_r * 0.45, 1.4 * s, ab_core)
		core.rotation.x = PI / 2.0
		core.position = Vector3(nx, 0, 7.6 * s + 0.7 * s)
		root.add_child(core)
		ab_glows.append(core)

	# ---------- چرخ فرود ----------
	var gear := Node3D.new()
	for gp in [Vector3(0, 0, 4.6 * s), Vector3(1.05 * s, 0, -0.4 * s), Vector3(-1.05 * s, 0, -0.4 * s)]:
		var strut := _cyl(0.05 * s, 1.1 * s, dark_mat)
		strut.position = Vector3(gp.x, -0.7 * s - 0.55 * s, gp.z)
		gear.add_child(strut)
		var wheel := SphereMesh.new()
		wheel.radius = 0.24 * s
		wheel.height = 0.48 * s
		var wm := MeshInstance3D.new()
		wm.mesh = wheel
		wm.material_override = dark_mat
		wm.scale = Vector3(0.5, 1.0, 1.0)
		wm.position = Vector3(gp.x, -0.7 * s - 1.15 * s, gp.y)
		gear.add_child(wm)
	root.add_child(gear)

	# ---------- چراغ ناوبری ----------
	_nav(root, Color(1, 0.2, 0.2), Vector3(-semi - 0.45 * s, -0.12 * s, wing_z - wp.sw * semi))
	_nav(root, Color(0.2, 1, 0.3), Vector3(semi + 0.45 * s, -0.12 * s, wing_z - wp.sw * semi))
	_nav(root, Color(1, 1, 1), Vector3(0, 0.6 * s, 7.4 * s))

	return {"node": root, "gear": gear, "ab": ab_glows}

# ---------- سازنده‌های کمکی ----------

static func _mat(c: Color, rough := 0.6, metal := 0.3) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m

static func _revolve(prof: Array, seg: int, scale: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in prof.size() - 1:
		var a: Vector2 = prof[i]
		var b: Vector2 = prof[i + 1]
		for k in seg:
			var a1 := TAU * float(k) / seg
			var a2 := TAU * float(k + 1) / seg
			var pa := Vector3(cos(a1) * a.x * scale, sin(a1) * a.x * scale, a.y * scale)
			var pb := Vector3(cos(a2) * a.x * scale, sin(a2) * a.x * scale, a.y * scale)
			var qa := Vector3(cos(a1) * b.x * scale, sin(a1) * b.x * scale, b.y * scale)
			var qb := Vector3(cos(a2) * b.x * scale, sin(a2) * b.x * scale, b.y * scale)
			st.add_vertex(pa); st.add_vertex(pb); st.add_vertex(qb)
			st.add_vertex(pa); st.add_vertex(qb); st.add_vertex(qa)
	st.generate_normals()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = mat
	return mi

static func _plank(root_c: float, tip_c: float, semi: float, sweep: float, thick: float, side: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var t := thick * 0.5
	var dir := side
	var p := [
		Vector3(0, t, 0), Vector3(dir * semi, t, -sweep), Vector3(dir * semi, t, -sweep - tip_c), Vector3(0, t, -root_c),
		Vector3(0, -t, 0), Vector3(dir * semi, -t, -sweep), Vector3(dir * semi, -t, -sweep - tip_c), Vector3(0, -t, -root_c),
	]
	var quads := [
		[0, 1, 2, 3], [7, 6, 5, 4],           # بالا / پایین
		[0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],  # لبه‌ها
	]
	return _faces(p, quads, mat)

static func _fin(root_c: float, tip_c: float, sweep: float, h: float, thick: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var t := thick * 0.5
	var p := [
		Vector3(-t, 0, 0), Vector3(-t, h, sweep), Vector3(-t, h, sweep + tip_c), Vector3(-t, 0, root_c),
		Vector3(t, 0, 0), Vector3(t, h, sweep), Vector3(t, h, sweep + tip_c), Vector3(t, 0, root_c),
	]
	var quads := [
		[0, 1, 2, 3], [4, 5, 6, 7],
		[0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
	]
	return _faces(p, quads, mat)

static func _faces(p: Array, quads: Array, mat: StandardMaterial3D) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for q in quads:
		var a: int = q[0]; var b: int = q[1]; var c: int = q[2]; var d: int = q[3]
		st.add_vertex(p[a]); st.add_vertex(p[b]); st.add_vertex(p[c])
		st.add_vertex(p[a]); st.add_vertex(p[c]); st.add_vertex(p[d])
	st.generate_normals()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = mat
	return mi

static func _box(w: float, h: float, d: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = Vector3(w, h, d)
	var mi := MeshInstance3D.new()
	mi.mesh = bm
	mi.material_override = mat
	return mi

static func _cyl(r: float, h: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.top_radius = r
	cm.bottom_radius = r
	cm.height = h
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	mi.material_override = mat
	return mi

static func _cone(r: float, h: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.top_radius = 0.01
	cm.bottom_radius = r
	cm.height = h
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi

static func _nav(parent: Node3D, c: Color, pos: Vector3) -> void:
	var sm := SphereMesh.new()
	sm.radius = 0.12
	sm.height = 0.24
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.emission_enabled = true
	m.emission = c
	m.emission_energy_multiplier = 3.0
	sm.material = m
	var mi := MeshInstance3D.new()
	mi.mesh = sm
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
