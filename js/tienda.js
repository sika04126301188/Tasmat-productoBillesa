/* ==========================================================
   Bolsa de compra de TasmaT (compartida por las tres páginas)
   - Catálogo con precios
   - La bolsa se guarda en el navegador (localStorage)
   - Panel lateral con la factura, el total y el botón de pagar
   - Aviso al añadir y menú hamburguesa del móvil
   ========================================================== */
window.TASMAT = (() => {
  const catalogo = {
    libre:       { nombre: "Libre",             tipo: "Crema corporal intensa",   formato: "250 ml", precio: 29, img: "img/libre.webp" },
    retinol:     { nombre: "Retinol 0.50",      tipo: "Crema antiarrugas regeneradora", formato: "30 ml",  precio: 39, img: "img/retinol.webp" },
    iluminadora: { nombre: "Crema iluminadora", tipo: "Unifica el tono",          formato: "100 ml", precio: 32, img: "img/iluminadora.webp" },
    azufre:      { nombre: "Crema de azufre",   tipo: "Tratamiento purificante",  formato: "30 ml",  precio: 26, img: "img/azufre.webp" },
    espuma:      { nombre: "Espuma limpiadora", tipo: "Crema espumosa sin jabón", formato: "300 ml", precio: 24, img: "img/espuma.webp" },
    hidratante:  { nombre: "Crema hidratante",  tipo: "Gel-crema de uso diario",  formato: "50 ml",  precio: 34, img: "img/hidratante.webp" },
  };

  const ENVIO_GRATIS = 35;      // € a partir de los que el envío estándar es gratis
  const ENVIOS = { estandar: 3.95, express: 6.9 };
  const IVA = 0.21;             // los precios llevan el IVA incluido
  const CODIGOS = { BIENVENIDA10: 0.1 };
  const CLAVE = "tasmat-bolsa";
  const CLAVE_CODIGO = "tasmat-codigo";

  const formato = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  const dinero = (n) => formato.format(n);

  /* ---------- 1. Guardado (con respaldo en memoria si el navegador no deja guardar) ---------- */
  const memoria = {};
  function leerClave(clave, defecto) {
    try {
      const valor = localStorage.getItem(clave);
      return valor === null ? defecto : JSON.parse(valor);
    } catch (error) {
      return clave in memoria ? memoria[clave] : defecto;
    }
  }
  function guardarClave(clave, valor) {
    memoria[clave] = valor;
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (error) { /* sin almacenamiento */ }
  }

  /* ---------- 2. La bolsa ---------- */
  const leer = () => leerClave(CLAVE, []).filter((linea) => catalogo[linea.id] && linea.cantidad > 0);
  function guardar(lineas) {
    guardarClave(CLAVE, lineas);
    document.dispatchEvent(new CustomEvent("bolsa:cambio"));
  }
  function anadir(id, cantidad = 1) {
    const lineas = leer();
    const linea = lineas.find((l) => l.id === id);
    if (linea) linea.cantidad = Math.min(linea.cantidad + cantidad, 20);
    else lineas.push({ id, cantidad: Math.min(cantidad, 20) });
    guardar(lineas);
  }
  function cambiar(id, cambio) {
    const lineas = leer().map((l) => (l.id === id ? { ...l, cantidad: Math.min(l.cantidad + cambio, 20) } : l));
    guardar(lineas.filter((l) => l.cantidad > 0));
  }
  const quitar = (id) => guardar(leer().filter((l) => l.id !== id));
  const vaciar = () => guardar([]);

  const codigo = () => leerClave(CLAVE_CODIGO, "");
  function aplicarCodigo(texto) {
    const limpio = String(texto || "").trim().toUpperCase();
    if (!(limpio in CODIGOS)) return false;
    guardarClave(CLAVE_CODIGO, limpio);
    document.dispatchEvent(new CustomEvent("bolsa:cambio"));
    return true;
  }
  function quitarCodigo() {
    guardarClave(CLAVE_CODIGO, "");
    document.dispatchEvent(new CustomEvent("bolsa:cambio"));
  }

  /* Totales: subtotal, descuento, envío, base imponible, IVA y total */
  function totales(opciones = {}) {
    const lineas = leer();
    const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
    const subtotal = lineas.reduce((s, l) => s + catalogo[l.id].precio * l.cantidad, 0);
    const cod = codigo();
    const descuento = cod ? Math.round(subtotal * CODIGOS[cod] * 100) / 100 : 0;
    const tras = subtotal - descuento;
    const tipoEnvio = opciones.envio || "estandar";
    let envio = 0;
    if (unidades) envio = tipoEnvio === "express" ? ENVIOS.express : (tras >= ENVIO_GRATIS ? 0 : ENVIOS.estandar);
    const total = Math.round((tras + envio) * 100) / 100;
    const base = Math.round((total / (1 + IVA)) * 100) / 100;
    return { lineas, unidades, subtotal, codigo: cod, descuento, envio, tipoEnvio, total, base, iva: Math.round((total - base) * 100) / 100, faltaGratis: Math.max(ENVIO_GRATIS - tras, 0) };
  }

  /* ---------- 3. Elementos comunes de la página ---------- */
  const cabecera = document.querySelector("body > header");
  const botonBolsa = cabecera.querySelector("button:first-of-type");
  const contador = botonBolsa.querySelector("output");
  const panel = document.querySelector("body > dialog");
  const aviso = document.querySelector("body > aside");

  /* Línea de la bolsa: foto, nombre, cantidad, importe y eliminar */
  function crearLinea(linea) {
    const p = catalogo[linea.id];
    const li = document.createElement("li");
    li.dataset.id = linea.id;

    const figura = document.createElement("figure");
    const img = document.createElement("img");
    img.src = p.img;
    img.alt = p.nombre;
    figura.append(img);

    const nombre = document.createElement("p");
    const fuerte = document.createElement("strong");
    fuerte.textContent = p.nombre;
    const detalle = document.createElement("small");
    detalle.textContent = `${p.formato} · ${dinero(p.precio)}`;
    nombre.append(fuerte, detalle);

    const cantidad = document.createElement("p");
    cantidad.setAttribute("role", "group");
    cantidad.setAttribute("aria-label", `Cantidad de ${p.nombre}`);
    const menos = document.createElement("button");
    menos.type = "button";
    menos.dataset.cambio = "-1";
    menos.setAttribute("aria-label", "Quitar uno");
    menos.textContent = "−";
    const salida = document.createElement("output");
    salida.textContent = linea.cantidad;
    const mas = document.createElement("button");
    mas.type = "button";
    mas.dataset.cambio = "1";
    mas.setAttribute("aria-label", "Añadir uno");
    mas.textContent = "+";
    cantidad.append(menos, salida, mas);

    const importe = document.createElement("data");
    importe.value = p.precio * linea.cantidad;
    importe.textContent = dinero(p.precio * linea.cantidad);

    const eliminar = document.createElement("button");
    eliminar.type = "button";
    eliminar.dataset.quitar = "";
    eliminar.setAttribute("aria-label", `Eliminar ${p.nombre} de la bolsa`);
    eliminar.textContent = "Eliminar";

    li.append(figura, nombre, importe, cantidad, eliminar);
    return li;
  }

  function pintarPanel() {
    const t = totales();
    contador.textContent = t.unidades;
    botonBolsa.setAttribute("aria-label", `Mi bolsa ${t.unidades} ${t.unidades === 1 ? "producto" : "productos"}`);
    if (!panel) return;

    panel.querySelector("header output").textContent = t.unidades;
    const lista = panel.querySelector("ul");
    lista.replaceChildren(...t.lineas.map(crearLinea));
    const vacia = t.unidades === 0;
    lista.hidden = vacia;
    panel.querySelector("footer").hidden = vacia;
    panel.querySelector("dialog > p").hidden = !vacia;
    if (vacia) return;

    const barra = panel.querySelector("progress");
    barra.value = Math.min(t.subtotal - t.descuento, ENVIO_GRATIS);
    panel.querySelector("footer > p:first-of-type span").textContent = t.faltaGratis > 0
      ? `Te faltan ${dinero(t.faltaGratis)} para el envío gratis`
      : "Tienes el envío gratis";

    const dd = panel.querySelectorAll("footer dd");
    const dtDescuento = panel.querySelector("footer dt:nth-of-type(2)");
    dd[0].textContent = dinero(t.subtotal);
    dtDescuento.hidden = dd[1].hidden = !t.descuento;
    dtDescuento.textContent = `Descuento (${t.codigo})`;
    dd[1].textContent = `−${dinero(t.descuento)}`;
    dd[2].textContent = t.envio ? dinero(t.envio) : "Gratis";
    dd[3].textContent = dinero(t.total);
    panel.querySelector("footer a").textContent = `Pagar ${dinero(t.total)}`;
  }

  function abrirBolsa() {
    if (!panel) return;
    pintarPanel();
    panel.showModal();
  }

  botonBolsa.addEventListener("click", abrirBolsa);
  if (panel) {
    panel.addEventListener("click", (e) => {
      if (e.target === panel) {                                   // clic en el fondo oscuro, fuera del panel
        const r = panel.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) panel.close();
        return;
      }
      // en la página de pago, «Pagar» solo cierra el panel
      if (e.target.closest("footer a") && /pago\.html$/.test(location.pathname)) { e.preventDefault(); return panel.close(); }
      const boton = e.target.closest("button");
      if (!boton) return;
      const li = boton.closest("li");
      if (boton.dataset.cambio && li) cambiar(li.dataset.id, Number(boton.dataset.cambio));
      else if ("quitar" in boton.dataset && li) quitar(li.dataset.id);
      else if (boton.closest("header") || boton.closest("footer")) panel.close();
    });
  }

  /* Aviso «añadido a la bolsa» */
  let temporizador;
  function avisar(id, cantidad) {
    const p = catalogo[id];
    if (!aviso || !p) return;
    aviso.querySelector("img").src = p.img;
    aviso.setAttribute("data-visible", "");
    requestAnimationFrame(() => {
      aviso.querySelector("strong").textContent = cantidad > 1 ? `${cantidad} × ${p.nombre}` : p.nombre;
    });
    clearTimeout(temporizador);
    temporizador = setTimeout(() => aviso.removeAttribute("data-visible"), 4200);
  }
  if (aviso) aviso.querySelector("button").addEventListener("click", () => { aviso.removeAttribute("data-visible"); abrirBolsa(); });

  /* Cualquier botón con data-anadir="id" añade el producto */
  document.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-anadir]");
    if (!boton) return;
    const salida = boton.closest("footer, li")?.querySelector("output");
    const cantidad = boton.closest("footer") && salida ? Number(salida.textContent) || 1 : 1;
    anadir(boton.dataset.anadir, cantidad);
    avisar(boton.dataset.anadir, cantidad);
    contador.removeAttribute("data-nuevo");
    void contador.offsetWidth;
    contador.setAttribute("data-nuevo", "");
    boton.setAttribute("data-anadido", "");
    setTimeout(() => boton.removeAttribute("data-anadido"), 1600);
  });

  document.addEventListener("bolsa:cambio", pintarPanel);
  addEventListener("storage", (e) => { if (e.key === CLAVE || e.key === CLAVE_CODIGO) document.dispatchEvent(new CustomEvent("bolsa:cambio")); });
  pintarPanel();

  /* ---------- 4. Menú hamburguesa (móvil) ---------- */
  const botonMenu = cabecera.querySelector("button:last-of-type");
  const menu = cabecera.querySelector("nav");
  let alturaAlAbrir = 0;
  function menuAbierto(abrir) {
    cabecera.toggleAttribute("data-menu", abrir);
    botonMenu.setAttribute("aria-expanded", String(abrir));
    botonMenu.setAttribute("aria-label", abrir ? "Cerrar el menú" : "Abrir el menú");
    alturaAlAbrir = scrollY;
  }
  botonMenu.addEventListener("click", () => menuAbierto(!cabecera.hasAttribute("data-menu")));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) menuAbierto(false); });
  document.addEventListener("click", (e) => {                       // tocar fuera lo cierra
    if (cabecera.hasAttribute("data-menu") && !menu.contains(e.target) && !botonMenu.contains(e.target)) menuAbierto(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menuAbierto(false); });
  addEventListener("scroll", () => {
    if (cabecera.hasAttribute("data-menu") && Math.abs(scrollY - alturaAlAbrir) > 30) menuAbierto(false);
    cabecera.toggleAttribute("data-scroll", scrollY > 20);
  }, { passive: true });
  addEventListener("pageshow", () => menuAbierto(false));

  /* ---------- 5. Aparición de bloques al entrar en pantalla ---------- */
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => {
      if (e.isIntersecting) { e.target.dataset.revelar = "visto"; observador.unobserve(e.target); }
    });
  }, { threshold: .12 });
  document.querySelectorAll("[data-revelar]").forEach((el) => observador.observe(el));

  return { catalogo, dinero, leer, anadir, cambiar, quitar, vaciar, totales, codigo, aplicarCodigo, quitarCodigo, abrirBolsa, ENVIOS, ENVIO_GRATIS, IVA };
})();
