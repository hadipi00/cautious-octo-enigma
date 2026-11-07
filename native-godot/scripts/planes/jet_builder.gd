# ============================================================
# jet_builder.gd — مدل‌ساز رویه‌ای جنگنده (ArrayMesh + PBR)
# بدنه دورانی (لاته) + بال/سکان اکسترود + کانوپی براق + موشک/ریل
# + بافت پنل‌لاین/پرچ تولیدی + کلیرکوت → بازتاب آفتاب روی بدنه
# قرارداد: دماغه −Z ، بالا +Y ، راست +X
# ============================================================
class_name JetBuilder

static var _tex_cache: Dictionary = {}

static func build(spec: Dictionary) -> Dictionary:
	var v: Dictionary = spec.get("visual", {})
	var s: float = spec.get("len", 15.0) / 15.0
	var span: float = spec.get("wingSpan", 10.0)
	var root := Node3D.new()
	root.name = "Jet"

	var body_col: Color = Color(v.get("body", "#7f8d9d"))
	var accent_col: Color = Color(v.get("accent", "#5a6470"))
	var tex := _panel_texture(body_col, accent_col, spec.get("nation", "USA"))

	var mat_body := StandardMaterial3D.new()
	mat_body.albedo_texture = tex
	mat_body.uv1_triplanar = true
	mat_body.uv1_scale = Vector3(0.09, 0.09, 0.09)
	mat_body.metallic = 0.72
	mat_body.roughness = 0.36
	mat_body.metallic_specular = 0.6
	mat_body.clearcoat_enabled = true
	mat_body.clearcoat = 0.55
	mat_body.clearcoat_roughness = 0.30

	var mat_dark := StandardMaterial3D.new()
	mat_dark.albedo_color = Color("#33383e")
	mat_dark.metallic = 0.6
	mat_dark.roughness = 0.5

	var mat_glass := StandardMaterial3D.new()
	mat_glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_glass.albedo_color = Color(0.10, 0.24, 0.34, 0.34)
	mat_glass.metallic = 0.4
	mat_glass.roughness = 0.05
	mat_glass.clearcoat_enabled = true
	mat_glass.clearcoat = 1.0
	mat_glass.emission_enabled = true
	mat_glass.emission = Color(0.05, 0.10, 0.14)
	mat_glass.emission_energy_multiplier = 0.4
	mat_glass.cull_mode = BaseMaterial3D.CULL_BACK

	var mat_flame := StandardMaterial3D.new()
	mat_flame.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat_flame.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_flame.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat_flame.albedo_color = Color(1.0, 0.55, 0.16, 0.8)
	mat_flame.cull_mode = BaseMaterial3D.CULL_DISABLED

	var mat_core := StandardMaterial3D.new()
	mat_core.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat_core.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_core.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat_core.albedo_color = Color(0.65, 0.8, 1.0, 0.9)
	mat_core.cull_mode = BaseMaterial3D.CULL_DISABLED

	var refs := {"ail": [], "elev": [], "rud": [], "flap": [], "gear": [],
			"flames": [], "canopy": null, "wing_pivots": []}

	# ---------- بدنه دورانی ----------
	var prof := [
		[0.30, -7.5], [0.46, -6.4], [0.58, -4.8], [0.64, -2.8], [0.66, -1.2],
		[0.66, 0.8], [0.62, 2.0], [0.52, 3.8], [0.38, 5.4], [0.22, 6.6],
		[0.10, 7.2], [0.0, 7.5],
	]
	var fus_mesh := _lathe(prof, 20, s * v.get("fusW", 1.0))
	var fus := MeshInstance3D.new()
	fus.mesh = fus_mesh
	fus.material_override = mat_body
	fus.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	root.add_child(fus)

	# رادوم + پیتوت
	var radome := MeshInstance3D.new()
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 0.2 * s
	cone.height = 0.9 * s
	radome.mesh = cone
	radome.rotation_degrees = Vector3(-90, 0, 0)  # محور Y → -Z
	radome.position = Vector3(0, 0.02 * s, 6.95 * s)
	radome.material_override = mat_dark
	root.add_child(radome)

	var pitot := MeshInstance3D.new()
	var pcyl := CylinderMesh.new()
	pcyl.top_radius = 0.02 * s
	pcyl.bottom_radius = 0.02 * s
	pcyl.height = 0.85 * s
	pitot.mesh = pcyl
	pitot.rotation_degrees = Vector3(-90, 0, 0)
	pitot.position = Vector3(0, 0.02 * s, 7.7 * s)
	pitot.material_override = mat_dark
	root.add_child(pitot)

	# ---------- بال ----------
	var semi := span / 2.0 - 0.45 * s
	var wingType: String = v.get("wingType", "swept")
	var wp: Array = {
		"swept": [4.6, 1.5, 0.56, 1.6], "delta": [6.8, 1.0, 0.70, 0.8],
		"variable": [5.4, 2.0, 0.50, 1.6], "straight": [5.2, 2.4, 0.10, 1.1],
	}.get(wingType, [4.6, 1.5, 0.56, 1.6])
	var root_chord: float = wp[0] * s
	var tip_chord: float = wp[1] * s
	var sweep_ang: float = wp[2]
	var z_le: float = wp[3] * s

	for side in [1.0, -1.0]:
		var pivot := Node3D.new()
		pivot.position = Vector3(side * 0.42 * s, -0.12 * s, z_le)
		pivot.rotation.y = side * sweep_ang
		root.add_child(pivot)
		refs.wing_pivots.append(pivot)

		var wing := MeshInstance3D.new()
		wing.mesh = _wing_mesh(semi * side, root_chord, tip_chord, s)
		wing.material_override = mat_body
		wing.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		pivot.add_child(wing)

		# ایلرون
		var ail := Node3D.new()
		ail.position = Vector3(side * semi * 0.72, -0.16 * s, -root_chord + 0.10 * s)
		var ail_m := MeshInstance3D.new()
		var ail_box := BoxMesh.new()
		ail_box.size = Vector3(0.30 * semi, 0.045 * s, 1.05 * s)
		ail_m.mesh = ail_box
		ail_m.position = Vector3(0, 0, -0.55 * s)
		ail_m.material_override = mat_dark
		ail.add_child(ail_m)
		pivot.add_child(ail)
		refs.ail.append(ail)

		# فلپ
		var flp := Node3D.new()
		flp.position = Vector3(side * semi * 0.30, -0.16 * s, -root_chord + 0.10 * s)
		var flp_m := MeshInstance3D.new()
		var flp_box := BoxMesh.new()
		flp_box.size = Vector3(0.36 * semi, 0.04 * s, 1.15 * s)
		flp_m.mesh = flp_box
		flp_m.position = Vector3(0, 0, -0.60 * s)
		flp_m.material_override = mat_dark
		flp.add_child(flp_m)
		pivot.add_child(flp)
		refs.flap.append(flp)

		# چراغ ناوبری
		var nav := MeshInstance3D.new()
		var nav_s := SphereMesh.new()
		nav_s.radius = 0.09 * s
		nav_s.height = 0.18 * s
		nav.mesh = nav_s
		nav.material_override = _emissive(Color(0.1, 1.0, 0.2) if side > 0 else Color(1.0, 0.15, 0.1))
		nav.position = Vector3(side * (semi - 0.02), -0.06 * s, -tip_chord * 0.55)
		pivot.add_child(nav)

	# ---------- کانارد ----------
	if v.get("canards", false):
		for side in [1.0, -1.0]:
			var can := MeshInstance3D.new()
			can.mesh = _fin_mesh(Vector2(0.55 * s, 1.55 * s), Vector2(-0.55 * s, 1.55 * s),
					Vector2(-0.55 * s, 0.0), Vector2(0.55 * s, 0.0), 0.06 * s)
			can.rotation.x = PI / 2.0
			var cp := Node3D.new()
			cp.position = Vector3(side * 0.3 * s, 0.02 * s, 3.6 * s)
			can.scale.x = side
			cp.add_child(can)
			root.add_child(cp)
			refs.rud.append(cp)  # با ورودی ردر حرکت کند (کانارد)

	# ---------- دم افقی ----------
	var h_semi: float = span * 0.20
	for side in [1.0, -1.0]:
		var st := Node3D.new()
		st.position = Vector3(side * 0.35 * s, 0.05 * s, -5.4 * s)
		var stab := MeshInstance3D.new()
		stab.mesh = _wing_mesh(h_semi * side, 2.0 * s, 0.8 * s, s, 0.55)
		stab.material_override = mat_body
		st.add_child(stab)
		root.add_child(st)
		refs.elev.append(st)

	# ---------- دم عمودی ----------
	var fin_h := 2.1 * s if v.get("tailType", "single") == "twin" else 2.7 * s
	var fin_xs := [0.62 * s, -0.62 * s] if v.get("tailType", "single") == "twin" else [0.0]
	for xoff in fin_xs:
		var fp := Node3D.new()
		fp.position = Vector3(xoff, 0.4 * s, -4.4 * s)
		var fin := MeshInstance3D.new()
		fin.mesh = _fin_mesh(Vector2(0.0, 0.0), Vector2(1.6 * s, fin_h),
				Vector2(2.6 * s, fin_h), Vector2(3.1 * s, 0.0), 0.09 * s)
		fin.rotation.y = PI / 2.0  # صفحه XZ→ZY
		fin.material_override = mat_body
		fp.add_child(fin)
		root.add_child(fp)
		refs.rud.append(fp)

	# ---------- کانوپی ----------
	var canopy := MeshInstance3D.new()
	var cs := SphereMesh.new()
	cs.radius = 1.0
	cs.height = 1.0
	cs.radial_segments = 16
	cs.rings = 8
	canopy.mesh = cs
	canopy.scale = Vector3(0.5 * s, 0.55 * s, 1.8 * s)
	canopy.position = Vector3(0, 0.48 * s, 2.9 * s)
	canopy.material_override = mat_glass
	canopy.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(canopy)
	refs.canopy = canopy

	# ---------- ورودی هوا ----------
	if v.get("engines", 1) == 2:
		for side in [1.0, -1.0]:
			var it := MeshInstance3D.new()
			var ib := BoxMesh.new()
			ib.size = Vector3(0.55 * s, 0.85 * s, 3.4 * s)
			it.mesh = ib
			it.position = Vector3(side * 0.75 * s, -0.12 * s, 1.8 * s)
			it.material_override = mat_body
			root.add_child(it)
	else:
		var it2 := MeshInstance3D.new()
		var ib2 := BoxMesh.new()
		ib2.size = Vector3(0.9 * s, 0.7 * s, 2.4 * s)
		it2.mesh = ib2
		it2.position = Vector3(0, -0.44 * s, 2.6 * s)
		it2.material_override = mat_dark
		root.add_child(it2)

	# ---------- نازل + شعله AB ----------
	var engines: int = v.get("engines", 1)
	var nz_r: float = (0.30 if engines == 2 else 0.34) * s
	var nz_xs: Array = [0.55 * s, -0.55 * s] if engines == 2 else [0.0]
	for nx in nz_xs:
		var noz := MeshInstance3D.new()
		var nz := CylinderMesh.new()
		nz.top_radius = nz_r
		nz.bottom_radius = nz_r * 0.88
		nz.height = 0.85 * s
		noz.mesh = nz
		noz.rotation_degrees = Vector3(-90, 0, 0)
		noz.position = Vector3(nx, 0, -7.2 * s)
		noz.material_override = mat_dark
		root.add_child(noz)

		var flame := MeshInstance3D.new()
		var fc := CylinderMesh.new()
		fc.top_radius = nz_r * 0.85
		fc.bottom_radius = 0.02
		fc.height = 2.6 * s
		flame.mesh = fc
		flame.rotation_degrees = Vector3(90, 0, 0)  # نوک به عقب
		flame.position = Vector3(nx, 0, -7.6 * s - 1.3 * s)
		flame.material_override = mat_flame
		flame.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		flame.visible = false
		root.add_child(flame)
		refs.flames.append(flame)

		var core := MeshInstance3D.new()
		var cc := CylinderMesh.new()
		cc.top_radius = nz_r * 0.4
		cc.bottom_radius = 0.01
		cc.height = 1.4 * s
		core.mesh = cc
		core.rotation_degrees = Vector3(90, 0, 0)
		core.position = Vector3(nx, 0, -7.6 * s - 0.7 * s)
		core.material_override = mat_core
		core.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		core.visible = false
		root.add_child(core)
		refs.flames.append(core)

	# ---------- چرخ فرود ----------
	for gp in [Vector3(0, -0.7 * s, 4.6 * s), Vector3(1.05 * s, -0.7 * s, -0.4 * s), Vector3(-1.05 * s, -0.7 * s, -0.4 * s)]:
		var pv := Node3D.new()
		pv.position = gp
		var strut := MeshInstance3D.new()
		var sc := CylinderMesh.new()
		sc.top_radius = 0.05 * s
		sc.bottom_radius = 0.05 * s
		sc.height = 1.1 * s
		strut.mesh = sc
		strut.position.y = -0.55 * s
		strut.material_override = mat_dark
		var wheel := MeshInstance3D.new()
		var wc := CylinderMesh.new()
		wc.top_radius = 0.26 * s
		wc.bottom_radius = 0.26 * s
		wc.height = 0.16 * s
		wheel.mesh = wc
		wheel.rotation_degrees = Vector3(0, 0, 90)
		wheel.position.y = -1.15 * s
		wheel.material_override = mat_dark
		pv.add_child(strut)
		pv.add_child(wheel)
		root.add_child(pv)
		refs.gear.append(pv)

	# ---------- موشک زیر بال ----------
	var mat_msl := StandardMaterial3D.new()
	mat_msl.albedo_color = Color("#c8ccd2")
	mat_msl.metallic = 0.55
	mat_msl.roughness = 0.38
	var msl_z: float = z_le - root_chord * 0.55 - 0.3 * s
	for side in [1.0, -1.0]:
		var pylon := MeshInstance3D.new()
		var pb := BoxMesh.new()
		pb.size = Vector3(0.10 * s, 0.16 * s, 0.9 * s)
		pylon.mesh = pb
		pylon.position = Vector3(side * semi * 0.55, -0.20 * s, msl_z)
		pylon.material_override = mat_dark
		root.add_child(pylon)
		for off in [-0.28, 0.28]:
			var msl := Node3D.new()
			var mb := MeshInstance3D.new()
			var mc := CylinderMesh.new()
			mc.top_radius = 0.07 * s
			mc.bottom_radius = 0.07 * s
			mc.height = 1.5 * s
			mb.mesh = mc
			mb.rotation_degrees = Vector3(-90, 0, 0)
			mb.material_override = mat_msl
			var mn := MeshInstance3D.new()
			var mnc := CylinderMesh.new()
			mnc.top_radius = 0.0
			mnc.bottom_radius = 0.07 * s
			mnc.height = 0.34 * s
			mn.mesh = mnc
			mn.rotation_degrees = Vector3(-90, 0, 0)
			mn.position.z = -0.9 * s
			mn.material_override = mat_msl
			msl.add_child(mb)
			msl.add_child(mn)
			msl.position = Vector3(side * semi * 0.55 + off * s, -0.30 * s, msl_z)
			root.add_child(msl)

	return {"node": root, "refs": refs}

# ---------- بدنه دورانی (لاته) ----------
static func _lathe(profile: Array, seg: int, scale: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n: int = profile.size()
	for i in n - 1:
		var r0: float = profile[i][0] * scale
		var z0: float = profile[i][1] * scale
		var r1: float = profile[i + 1][0] * scale
		var z1: float = profile[i + 1][1] * scale
		for j in seg:
			var a0: float = TAU * j / seg
			var a1: float = TAU * (j + 1) / seg
			var p00 := Vector3(cos(a0) * r0, sin(a0) * r0, z0)
			var p01 := Vector3(cos(a1) * r0, sin(a1) * r0, z0)
			var p10 := Vector3(cos(a0) * r1, sin(a0) * r1, z1)
			var p11 := Vector3(cos(a1) * r1, sin(a1) * r1, z1)
			st.set_uv(Vector2(j / float(seg), i / float(n)))
			st.add_vertex(p10)
			st.set_uv(Vector2((j + 1) / float(seg), i / float(n)))
			st.add_vertex(p11)
			st.set_uv(Vector2(j / float(seg), i / float(n)))
			st.add_vertex(p00)
			st.set_uv(Vector2(j / float(seg), i / float(n)))
			st.add_vertex(p00)
			st.set_uv(Vector2((j + 1) / float(seg), i / float(n)))
			st.add_vertex(p11)
			st.set_uv(Vector2((j + 1) / float(seg), (i + 1) / float(n)))
			st.add_vertex(p01)
	st.generate_normals()
	return st.commit()

# ---------- بال (اکسترود باریک با وتر متغیر) ----------
static func _wing_mesh(semi: float, root_c: float, tip_c: float, s: float, taper_z: float = 1.0) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var y := -0.05 * s
	var dir: float = signf(semi)
	var ax := absf(semi)
	var root_le := 0.0
	var root_te := -root_c
	var tip_le := -taper_z * (ax * 0.55)
	var tip_te := tip_le - tip_c
	# سطح بالا و پایین + لبه
	for top in [1.0, -1.0]:
		var yy: float = y * top
		var h: float = 0.05 * s * top
		st.set_normal(Vector3(0, top, 0))
		st.add_vertex(Vector3(0, yy + h * 0.0, root_le))
		st.add_vertex(Vector3(ax, tip_le + h * 0.0, tip_le))
		st.add_vertex(Vector3(ax, tip_le + h * 0.0, tip_te))
		st.add_vertex(Vector3(0, yy + h * 0.0, root_le))
		st.add_vertex(Vector3(ax, tip_le + h * 0.0, tip_te))
		st.add_vertex(Vector3(0, yy + h * 0.0, root_te))
	# دیواره‌های لبه فرود/فرود/نوک
	for e in [[Vector3(0, y, root_le), Vector3(0, y, root_te)],
			[Vector3(ax, y, tip_le), Vector3(ax, y, tip_te)]]:
		st.add_vertex(e[0] + Vector3(0, 0.05 * s, 0))
		st.add_vertex(e[1] + Vector3(0, 0.05 * s, 0))
		st.add_vertex(e[0])
		st.add_vertex(e[0])
		st.add_vertex(e[1] + Vector3(0, 0.05 * s, 0))
		st.add_vertex(e[1])
	st.generate_normals()
	return st.commit()

# ---------- باله عمودی (چهارگوش دلخواه) ----------
static func _fin_mesh(a: Vector2, b: Vector2, c: Vector2, d: Vector2, thick: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var t := thick / 2.0
	var pts := [a, b, c, d]
	for i in 4:
		var p0: Vector2 = pts[i]
		var p1: Vector2 = pts[(i + 1) % 4]
		# دو رو + دیواره
		st.add_vertex(Vector3(p0.x, p0.y, t))
		st.add_vertex(Vector3(p1.x, p1.y, t))
		st.add_vertex(Vector3(p0.x, p0.y, -t))
		st.add_vertex(Vector3(p0.x, p0.y, -t))
		st.add_vertex(Vector3(p1.x, p1.y, t))
		st.add_vertex(Vector3(p1.x, p1.y, -t))
		st.add_vertex(Vector3(p0.x, p0.y, t))
		st.add_vertex(Vector3(p0.x, p0.y, -t))
		st.add_vertex(Vector3(p1.x, p1.y, t))
		st.add_vertex(Vector3(p1.x, p1.y, t))
		st.add_vertex(Vector3(p0.x, p0.y, -t))
		st.add_vertex(Vector3(p1.x, p1.y, -t))
	st.generate_normals()
	return st.commit()

static func _emissive(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = c
	return m

# ---------- بافت پنل‌لاین ----------
static func _panel_texture(base: Color, accent: Color, nation: String) -> ImageTexture:
	var key: String = base.to_html() + accent.to_html() + nation
	if _tex_cache.has(key):
		return _tex_cache[key]
	var img := Image.create(512, 512, false, Image.FORMAT_RGBA8)
	var bc := base
	var acc := accent
	for y in 512:
		for x in 512:
			var n: float = 0.94 + 0.06 * sin(x * 0.7 + y * 0.3) * randf()
			img.set_pixel(x, y, Color(bc.r * n, bc.g * n, bc.b * n))
	# لکه‌های کمو
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(key)
	for i in 10:
		var px := rng.randi_range(0, 511)
		var py := rng.randi_range(0, 511)
		var rw := rng.randi_range(30, 105)
		var rh := rng.randi_range(13, 48)
		var pc := acc.lerp(Color.BLACK, 0.15)
		for y in range(max(0, py - rh), min(512, py + rh)):
			for x in range(max(0, px - rw), min(512, px + rw)):
				var dx := (x - px) / float(rw)
				var dy := (y - py) / float(rh)
				if dx * dx + dy * dy < 1.0:
					var c := img.get_pixel(x, y)
					img.set_pixel(x, y, c.lerp(pc, 0.20))
	# خطوط پنل افقی + پرچ
	for ly in [51, 113, 168, 236, 297, 358, 419, 470]:
		for x in 512:
			var c := img.get_pixel(x, ly)
			img.set_pixel(x, ly, c * 0.72)
			if x % 14 == 0:
				var c2 := img.get_pixel(x, clampi(ly + 4, 0, 511))
				img.set_pixel(x, clampi(ly + 4, 0, 511), c2 * 0.85)
	# درزهای طولی
	for lx in [82, 256, 430]:
		for y in 512:
			var c := img.get_pixel(lx, y)
			img.set_pixel(lx, y, c * 0.82)
	var t := ImageTexture.create_from_image(img)
	_tex_cache[key] = t
	return t
