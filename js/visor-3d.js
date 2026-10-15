/* ==========================================================
   Visor 3D de la página de producto de TasmaT
   - Un producto cada vez, se gira arrastrando (ratón o dedo)
   - Se balancea despacio cuando nadie lo toca
   - El producto se elige con ?p=id en la dirección (producto.html?p=retinol)
   - Funciona abriendo los archivos directamente (sin servidor)
   ========================================================== */
(() => {
  const seccion = document.querySelector("#producto");
  if (!seccion) return;
  const figura = seccion.querySelector(":scope > figure");
  const lienzo = figura.querySelector("canvas");
  const foto = figura.querySelector("img");
  const fichas = [...seccion.querySelectorAll(":scope > article")];
  const menu = seccion.querySelector(":scope > nav:last-of-type");
  const enlaces = [...menu.querySelectorAll("li a")];
  const [anterior, siguiente] = menu.querySelectorAll(":scope > button");
  const miga = seccion.querySelector(":scope > nav:first-of-type li:last-of-type a");
  const modelos = new Map((window.TASMAT_3D || []).map((m) => [m.id, m]));
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let actual = -1;
  const indiceDe = (id) => Math.max(fichas.findIndex((f) => f.id === id), 0);
  const pedido = () => new URLSearchParams(location.search).get("p");

  /* ---------- 1. Cambiar de ficha (funciona aunque no haya 3D) ---------- */
  function mostrar(indice, historial = "push") {
    indice = (indice + fichas.length) % fichas.length;
    if (indice === actual) return;
    actual = indice;
    const ficha = fichas[actual];
    fichas.forEach((f, i) => (f.hidden = i !== actual));
    enlaces.forEach((a, i) => (i === actual ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));

    const nombre = ficha.querySelector("h1").firstChild.textContent.trim();
    foto.src = `img/${ficha.id}.webp`;
    foto.alt = `${nombre}, ${ficha.querySelector("h1 em").textContent.toLowerCase()} TasmaT`;
    miga.textContent = nombre;
    miga.href = `producto.html?p=${ficha.id}`;
    document.title = `${nombre} — TasmaT`;
    try {
      if (historial === "push") history.pushState({ p: ficha.id }, "", `?p=${ficha.id}`);
      if (historial === "replace") history.replaceState({ p: ficha.id }, "", `?p=${ficha.id}`);
    } catch (error) { /* algunos navegadores no dejan cambiar la dirección en archivos locales */ }

    // Si un producto no tiene modelo 3D, se enseña su foto
    if (visor && modelos.has(ficha.id)) visor.cargar(ficha.id);
    else delete figura.dataset.estado;
    document.dispatchEvent(new CustomEvent("producto:cambio", { detail: { id: ficha.id } }));
  }

  // Cualquier enlace a producto.html?p=… de esta página cambia de producto sin recargar
  document.addEventListener("click", (e) => {
    const enlace = e.target.closest('a[href^="producto.html?p="]');
    if (!enlace || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    mostrar(indiceDe(new URL(enlace.href).searchParams.get("p")));
    if (!seccion.contains(enlace)) scrollTo({ top: 0, behavior: sinMovimiento ? "auto" : "smooth" });
  });
  addEventListener("popstate", () => mostrar(indiceDe(pedido()), "nada"));
  anterior.addEventListener("click", () => mostrar(actual - 1, "replace"));
  siguiente.addEventListener("click", () => mostrar(actual + 1, "replace"));

  /* ---------- 2. Visor WebGL ---------- */
  const visor = window.THREE && modelos.size && crearVisor();
  mostrar(indiceDe(pedido()), "nada");

  function crearVisor() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
    } catch (error) {
      return null; // sin WebGL se queda la foto
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const escena = new THREE.Scene();
    escena.environment = crearEstudio(renderer);

    const camara = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
    camara.position.set(0, 0.62, 3.4);

    escena.add(new THREE.HemisphereLight(0xffffff, 0xdcdce2, 1.1));
    const luz = new THREE.DirectionalLight(0xffffff, 1.6);
    luz.position.set(-2.5, 3.5, 3);
    escena.add(luz);
    const contraluz = new THREE.DirectionalLight(0xf2f6ff, 0.9);
    contraluz.position.set(3, 1.5, -2.5);
    escena.add(contraluz);

    const sombra = crearSombra();
    escena.add(sombra);

    const soporte = new THREE.Group(); // inclinación con el arrastre vertical
    const pieza = new THREE.Group();   // giro con el arrastre horizontal
    soporte.add(pieza);
    escena.add(soporte);

    const cache = new Map();
    const cargador = new THREE.TextureLoader();

    /* Arrastre con inercia */
    let giro = 0.25, velocidad = 0, inclinacion = 0, arrastrando = false, ultimoX = 0, ultimoY = 0, reposo = 0, balanceo = 0.25;
    lienzo.addEventListener("pointerdown", (e) => {
      arrastrando = true;
      ultimoX = e.clientX;
      ultimoY = e.clientY;
      lienzo.setPointerCapture(e.pointerId);
      figura.dataset.estado = "girando";
    });
    lienzo.addEventListener("pointermove", (e) => {
      if (!arrastrando) return;
      const dx = e.clientX - ultimoX;
      const dy = e.clientY - ultimoY;
      ultimoX = e.clientX;
      ultimoY = e.clientY;
      velocidad = dx * 0.012;
      giro += velocidad;
      inclinacion = THREE.MathUtils.clamp(inclinacion + dy * 0.004, -0.22, 0.32);
    });
    const soltar = () => {
      arrastrando = false;
      reposo = performance.now();
      figura.dataset.estado = "listo";
    };
    lienzo.addEventListener("pointerup", soltar);
    lienzo.addEventListener("pointercancel", soltar);

    /* Transición entre productos y encuadre de cámara */
    let escala = 0, objetivo = 1;
    let presentacion = null;
    let distancia = 3.4, distanciaObjetivo = 3.4, ancho = 0.5;

    function construir(datos) {
      const grupo = new THREE.Group();
      datos.piezas.forEach((p) => {
        let geometria;
        if (p.tipo === "torno") geometria = torno(p.perfil);
        else if (p.tipo === "tubo") geometria = tubo(p.secciones);
        else geometria = pala(p.silueta, p.grosor);

        const m = p.material || {};
        const material = new THREE.MeshPhysicalMaterial({
          color: p.color ? new THREE.Color(p.color) : 0xffffff,
          roughness: m.rugosidad ?? 0.4,
          metalness: m.metal ?? 0,
          clearcoat: m.barniz ?? 0.3,
          clearcoatRoughness: 0.25,
          envMapIntensity: 0.55,
        });
        if (p.textura) {
          const textura = cargador.load(p.textura);
          textura.colorSpace = THREE.SRGBColorSpace;
          textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
          material.map = textura;
        }
        const malla = new THREE.Mesh(geometria, material);
        malla.position.set(p.x || 0, 0, p.z || 0);
        grupo.add(malla);
      });
      // Centrar y ajustar a una altura de 1 unidad
      const caja = new THREE.Box3().setFromObject(grupo);
      const tam = caja.getSize(new THREE.Vector3());
      const centro = caja.getCenter(new THREE.Vector3());
      grupo.children.forEach((malla) => malla.position.sub(new THREE.Vector3(centro.x, caja.min.y, centro.z)));
      const ajuste = 1 / tam.y;
      grupo.scale.setScalar(ajuste);
      grupo.userData.ancho = Math.max(tam.x, tam.z) * ajuste;
      return grupo;
    }

    function cargar(id) {
      if (!cache.has(id)) cache.set(id, construir(modelos.get(id)));
      const nuevo = cache.get(id);
      pieza.clear();
      pieza.add(nuevo);
      ancho = nuevo.userData.ancho;
      sombra.scale.setScalar(0.9 + ancho * 1.1);
      encuadrar();
      escala = sinMovimiento ? 1 : 0.86;
      objetivo = 1;
      // media vuelta de presentación que termina mirando de frente
      presentacion = sinMovimiento ? null : { desde: -Math.PI * 0.9, t: 0 };
      giro = sinMovimiento ? 0.2 : -Math.PI * 0.9;
      velocidad = 0;
      figura.dataset.estado = "listo";
    }

    // Distancia de cámara para que el producto llene el encuadre (alto 1, ancho variable)
    function encuadrar() {
      const tangente = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
      const porAlto = 1 / 0.7 / (2 * tangente);
      const porAncho = ancho / 0.64 / (2 * tangente * camara.aspect);
      distanciaObjetivo = Math.max(porAlto, porAncho);
    }

    /* Tamaño */
    function ajustar() {
      const { width, height } = lienzo.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camara.aspect = width / height;
      camara.fov = width / height < 0.8 ? 30 : 24;
      camara.updateProjectionMatrix();
      encuadrar();
    }
    new ResizeObserver(ajustar).observe(lienzo);
    ajustar();

    /* Solo se dibuja cuando la sección está en pantalla */
    let enPantalla = false;
    new IntersectionObserver(([entrada]) => (enPantalla = entrada.isIntersecting)).observe(lienzo);

    let antes = performance.now();
    renderer.setAnimationLoop((ahora) => {
      const dt = Math.min((ahora - antes) / 1000, 0.05);
      antes = ahora;
      if (!enPantalla) return;
      if (presentacion && !arrastrando) {
        presentacion.t = Math.min(presentacion.t + dt / 1.5, 1);
        const k = 1 - Math.pow(1 - presentacion.t, 3);
        giro = presentacion.desde + (0.25 - presentacion.desde) * k;
        if (presentacion.t === 1) {
          presentacion = null;
          reposo = ahora;
          balanceo = giro;
        }
      } else if (!arrastrando) {
        velocidad *= Math.pow(0.04, dt);
        giro += velocidad;
        // en reposo: balanceo suave alrededor del ángulo actual
        if (Math.abs(velocidad) > 0.002) balanceo = giro;
        if (!sinMovimiento && Math.abs(velocidad) <= 0.002) {
          const t = (ahora - reposo) / 1000;
          giro += ((balanceo + Math.sin(t * 0.55) * 0.42) - giro) * Math.min(dt * 1.5, 1);
        }
        inclinacion *= Math.pow(0.2, dt);
      } else {
        presentacion = null;
      }
      escala += (objetivo - escala) * Math.min(dt * 7, 1);
      distancia += (distanciaObjetivo - distancia) * Math.min(dt * 4, 1);
      camara.position.set(0, 0.5 + distancia * 0.045, distancia);
      camara.lookAt(0, 0.5, 0);
      pieza.rotation.y = giro;
      soporte.rotation.x = inclinacion;
      soporte.scale.setScalar(escala);
      sombra.material.opacity = 0.55 * escala;
      renderer.render(escena, camara);
    });

    return { cargar };
  }

  /* ---------- 3. Geometrías ---------- */
  // Superficie de revolución: perfil = [[radio, altura, v], ...] de abajo arriba
  function torno(perfil, lados = 120) {
    return superficie(perfil.length, lados, (i, fi) => {
      const [r, y] = perfil[i];
      return [Math.sin(fi) * r, y, Math.cos(fi) * r];
    }, (i) => perfil[i][2]);
  }

  // Tubo de crema: sección elíptica (ancho a, fondo b) = [[a, b, altura, v], ...] de arriba abajo
  function tubo(secciones, lados = 120) {
    const s = [...secciones].reverse();
    const primera = s[0];
    const ultima = s[s.length - 1];
    s.unshift([0, 0, primera[2], primera[3]]);     // tapa inferior
    s.push([ultima[0], 0, ultima[2] + 0.004, ultima[3]]); // pliegue superior
    return superficie(s.length, lados, (i, fi) => {
      const [a, b, y] = s[i];
      return [Math.sin(fi) * a, y, Math.cos(fi) * Math.max(b, 0.002)];
    }, (i) => s[i][3]);
  }

  function superficie(filas, lados, punto, v) {
    const posiciones = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i < filas; i++) {
      for (let j = 0; j <= lados; j++) {
        const u = j / lados;
        posiciones.push(...punto(i, (u - 0.5) * Math.PI * 2));
        uvs.push(u, v(i));
      }
    }
    for (let i = 0; i < filas - 1; i++) {
      for (let j = 0; j < lados; j++) {
        const a = i * (lados + 1) + j;
        const b = a + lados + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  // Cabezal del dosificador: silueta 2D extruida con bordes redondeados
  function pala(silueta, grosor) {
    const forma = new THREE.Shape(silueta.map(([x, y]) => new THREE.Vector2(x, y)));
    const bisel = grosor * 0.22;
    const g = new THREE.ExtrudeGeometry(forma, {
      depth: grosor - bisel * 2,
      bevelEnabled: true,
      bevelThickness: bisel,
      bevelSize: bisel * 0.6,
      bevelSegments: 4,
      curveSegments: 6,
    });
    g.translate(0, 0, -(grosor - bisel * 2) / 2);
    g.computeVertexNormals();
    return g;
  }

  /* ---------- 4. Luz de estudio y sombra ---------- */
  function crearEstudio(renderer) {
    const sala = new THREE.Scene();
    sala.add(new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0xf0f0f3, side: THREE.BackSide })
    ));
    const caja = (ancho, alto, x, y, z, brillo) => {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(ancho, alto),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(brillo, brillo, brillo * 0.97), side: THREE.DoubleSide })
      );
      panel.position.set(x, y, z);
      panel.lookAt(0, 0, 0);
      sala.add(panel);
    };
    caja(5, 6, -6, 3, 4, 4);   // ventana grande a la izquierda
    caja(3, 6, 6, 2, 2, 2.4);  // relleno a la derecha
    caja(8, 3, 0, 8, 0, 2);    // techo
    const pmrem = new THREE.PMREMGenerator(renderer);
    return pmrem.fromScene(sala, 0.04).texture;
  }

  function crearSombra() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(29, 29, 31, .5)");
    grad.addColorStop(0.35, "rgba(29, 29, 31, .2)");
    grad.addColorStop(1, "rgba(29, 29, 31, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const malla = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.42),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
    );
    malla.rotation.x = -Math.PI / 2;
    malla.position.y = 0.002;
    return malla;
  }
})();
