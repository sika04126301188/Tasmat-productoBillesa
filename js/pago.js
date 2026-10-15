/* ==========================================================
   Página de pago de TasmaT
   - Factura en vivo: productos, descuento, envío, base, IVA y total
   - Métodos de pago: tarjeta, PayPal, Bizum y transferencia
   - Confirmación con la factura completa lista para imprimir
   IMPORTANTE: el cobro está simulado. Para cobrar de verdad hay que
   conectar el formulario con una pasarela de pago (Stripe, Redsys…).
   ========================================================== */
(() => {
  const T = window.TASMAT;
  const [pago, confirmacion, vacia] = document.querySelectorAll("main > section");
  const formulario = pago.querySelector(":scope > form");
  const factura = pago.querySelector(":scope > aside");
  const lista = factura.querySelector("ul");
  const formCodigo = factura.querySelector("form");
  const mensajeCodigo = factura.querySelector(":scope > p:first-of-type");
  const dt = factura.querySelectorAll("dl dt");
  const dd = factura.querySelectorAll("dl dd");
  const botonPagar = formulario.querySelector(":scope > footer > button");
  const precioEstandar = formulario.querySelector('input[value="estandar"] ~ data');
  const bloquesMetodo = [...formulario.querySelectorAll("fieldset[data-metodo]")];
  const bloqueEmpresa = formulario.querySelector("fieldset[data-empresa]");
  const CLAVE_PEDIDO = "tasmat-ultimo-pedido";

  /* ---------- 1. Número de factura y fecha ---------- */
  const hoy = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  const sello = `${String(hoy.getFullYear()).slice(2)}${dos(hoy.getMonth() + 1)}${dos(hoy.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
  const numero = `TSM-${sello}`;
  const fechaLarga = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const formatoDia = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const fechaDia = { format: (d) => formatoDia.format(d).replace(",", "") };   // «viernes 16 de octubre»

  factura.querySelector("header b").textContent = numero;
  const tiempo = factura.querySelector("header time");
  tiempo.dateTime = hoy.toISOString().slice(0, 10);
  tiempo.textContent = fechaLarga.format(hoy);
  formulario.querySelector('fieldset[data-metodo="transferencia"] dd:last-of-type').textContent = numero;

  let confirmado = false;
  const envioElegido = () => formulario.elements.envio.value;

  /* ---------- 2. Factura en vivo ---------- */
  function crear(etiqueta, texto) {
    const el = document.createElement(etiqueta);
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function lineaFactura(linea) {
    const p = T.catalogo[linea.id];
    const li = crear("li");
    const figura = crear("figure");
    figura.dataset.cantidad = linea.cantidad;
    const img = crear("img");
    img.src = p.img;
    img.alt = p.nombre;
    figura.append(img);
    const texto = crear("p");
    texto.append(crear("strong", p.nombre), crear("small", `${p.formato} · ${linea.cantidad} × ${T.dinero(p.precio)}`));
    const importe = crear("data", T.dinero(p.precio * linea.cantidad));
    importe.value = p.precio * linea.cantidad;
    li.append(figura, texto, importe);
    return li;
  }

  function pintar() {
    if (confirmado) return;
    const t = T.totales({ envio: envioElegido() });
    const hayAlgo = t.unidades > 0;
    pago.hidden = !hayAlgo;
    vacia.hidden = hayAlgo;
    confirmacion.hidden = true;
    if (!hayAlgo) return;

    lista.replaceChildren(...t.lineas.map(lineaFactura));
    dd[0].textContent = T.dinero(t.subtotal);
    dt[1].hidden = dd[1].hidden = !t.descuento;
    dt[1].textContent = `Descuento (${t.codigo})`;
    dd[1].textContent = `−${T.dinero(t.descuento)}`;
    dd[2].textContent = t.envio ? T.dinero(t.envio) : "Gratis";
    dd[3].textContent = T.dinero(t.base);
    dd[4].textContent = T.dinero(t.iva);
    dd[5].textContent = T.dinero(t.total);

    // El envío estándar es gratis a partir de 35 €
    const gratis = t.subtotal - t.descuento >= T.ENVIO_GRATIS;
    precioEstandar.value = gratis ? 0 : T.ENVIOS.estandar;
    precioEstandar.textContent = gratis ? "Gratis" : T.dinero(T.ENVIOS.estandar);

    if (botonPagar.getAttribute("aria-busy") !== "true") botonPagar.textContent = `Pagar ${T.dinero(t.total)}`;
    const campoCodigo = formCodigo.elements.codigo;
    if (t.codigo) campoCodigo.value = t.codigo;
    campoCodigo.readOnly = Boolean(t.codigo);
    formCodigo.querySelector("button").textContent = t.codigo ? "Quitar" : "Aplicar";
  }

  /* Código de descuento */
  formCodigo.addEventListener("submit", (e) => {
    e.preventDefault();
    const campo = formCodigo.elements.codigo;
    if (T.codigo()) {
      T.quitarCodigo();
      campo.value = "";
      mensajeCodigo.textContent = "Has quitado el código de descuento.";
    } else if (T.aplicarCodigo(campo.value)) {
      mensajeCodigo.textContent = `Código ${T.codigo()} aplicado: 10 % de descuento.`;
    } else {
      mensajeCodigo.textContent = campo.value.trim() ? "Ese código no es válido o ha caducado." : "Escribe tu código de descuento.";
    }
  });

  factura.querySelector("header button").addEventListener("click", T.abrirBolsa);

  /* ---------- 3. Envío, método de pago y datos fiscales ---------- */
  function cambiarMetodo() {
    const elegido = formulario.elements.metodo.value;
    bloquesMetodo.forEach((bloque) => {
      const activo = bloque.dataset.metodo === elegido;
      bloque.hidden = !activo;
      bloque.disabled = !activo;   // un bloque desactivado no se valida ni se envía
    });
  }

  formulario.addEventListener("change", (e) => {
    const campo = e.target;
    if (campo.name === "envio") pintar();
    if (campo.name === "metodo") cambiarMetodo();
    if (campo.name === "empresa") bloqueEmpresa.hidden = bloqueEmpresa.disabled = !campo.checked;
  });

  /* Vista previa de la tarjeta mientras se escribe */
  const vista = formulario.querySelector('fieldset[data-metodo="tarjeta"] > figure');
  const vistaNumero = vista.querySelector("p:nth-of-type(2)");
  const [vistaTitular, vistaCaducidad] = vista.querySelectorAll("p:last-of-type b");
  const agrupar = (texto) => texto.replace(/(.{4})/g, "$1 ").trim();

  formulario.addEventListener("input", (e) => {
    const campo = e.target;
    if (campo.name === "numero") {
      const digitos = campo.value.replace(/\D/g, "").slice(0, 19);
      campo.value = agrupar(digitos);
      vistaNumero.textContent = agrupar(digitos.padEnd(16, "•"));
    }
    if (campo.name === "caducidad") {
      let d = campo.value.replace(/\D/g, "").slice(0, 4);
      if (d.length > 2) d = `${d.slice(0, 2)}/${d.slice(2)}`;
      campo.value = d;
      vistaCaducidad.lastChild.textContent = d || "MM/AA";
    }
    if (campo.name === "titular") vistaTitular.lastChild.textContent = campo.value.trim() || "Nombre Apellido";
    if (campo.name === "cvc" || campo.name === "cp") campo.value = campo.value.replace(/\D/g, "");
  });

  /* ---------- 4. Pagar (simulado) ---------- */
  formulario.addEventListener("submit", (e) => {
    e.preventDefault();
    if (botonPagar.getAttribute("aria-busy") === "true") return;
    botonPagar.setAttribute("aria-busy", "true");
    botonPagar.textContent = "Procesando el pago…";
    setTimeout(confirmar, 1300);
  });

  function sumarLaborables(fecha, dias) {
    const d = new Date(fecha);
    while (dias > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) dias--;
    }
    return d;
  }

  function describirPago(metodo, datos) {
    if (metodo === "tarjeta") return { detalle: `Tarjeta terminada en ${String(datos.get("numero")).replace(/\D/g, "").slice(-4)}`, estado: "Pagada" };
    if (metodo === "paypal") return { detalle: "PayPal", estado: "Pagada" };
    if (metodo === "bizum") return { detalle: `Bizum · móvil terminado en ${String(datos.get("bizum")).replace(/\D/g, "").slice(-3)}`, estado: "Pagada" };
    return { detalle: "Transferencia bancaria", estado: "Pendiente de pago" };
  }

  function confirmar() {
    const t = T.totales({ envio: envioElegido() });
    const datos = new FormData(formulario);          // los bloques desactivados no se incluyen
    const metodo = datos.get("metodo");
    const urgente = t.tipoEnvio === "express";
    const pedido = {
      numero,
      fecha: hoy.toISOString(),
      lineas: t.lineas.map((l) => ({ id: l.id, cantidad: l.cantidad, ...T.catalogo[l.id] })),
      subtotal: t.subtotal, codigo: t.codigo, descuento: t.descuento, envio: t.envio,
      base: t.base, iva: t.iva, total: t.total,
      tipoEnvio: urgente ? "Envío exprés" : "Envío estándar",
      entrega: urgente
        ? `el ${fechaDia.format(sumarLaborables(hoy, 1))}`
        : `entre el ${fechaDia.format(sumarLaborables(hoy, 1))} y el ${fechaDia.format(sumarLaborables(hoy, 2))}`,
      metodo,
      pago: describirPago(metodo, datos),
      cliente: {
        nombre: `${datos.get("nombre")} ${datos.get("apellidos")}`.trim(),
        correo: datos.get("correo"),
        telefono: datos.get("telefono"),
        direccion: datos.get("direccion"),
        cp: datos.get("cp"),
        ciudad: datos.get("ciudad"),
        provincia: datos.get("provincia"),
        razon: datos.get("razon") || "",
        nif: (datos.get("nif") || "").toUpperCase(),
      },
    };
    confirmado = true;
    try { localStorage.setItem(CLAVE_PEDIDO, JSON.stringify(pedido)); } catch (error) { /* sin almacenamiento */ }
    T.vaciar();
    T.quitarCodigo();
    pintarConfirmacion(pedido);
    try { history.replaceState(null, "", "#confirmacion"); } catch (error) { /* archivo local */ }
    scrollTo({ top: 0 });
  }

  /* ---------- 5. Confirmación: la factura completa ---------- */
  function conSaltos(parrafo, lineas) {
    parrafo.replaceChildren(...lineas.filter(Boolean).flatMap((texto, i) => (i ? [crear("br"), texto] : [texto])));
  }

  function filaTotal(etiqueta, valor) {
    const tr = crear("tr");
    const th = crear("th", etiqueta);
    th.scope = "row";
    th.colSpan = 3;
    tr.append(th, crear("td", valor));
    return tr;
  }

  function pintarConfirmacion(p) {
    pago.hidden = true;
    vacia.hidden = true;
    confirmacion.hidden = false;
    document.title = "Pedido confirmado — TasmaT";

    const cabecera = confirmacion.querySelector(":scope > header");
    cabecera.querySelector("h1 em").textContent = `${p.cliente.nombre.split(" ")[0]}.`;
    const resumen = cabecera.querySelector("p:nth-of-type(2)");
    const correo = crear("b", p.cliente.correo);
    const llegada = p.metodo === "transferencia"
      ? ". Lo prepararemos en cuanto recibamos la transferencia."
      : `. Tu pedido llegará ${p.entrega}.`;
    resumen.replaceChildren("Hemos enviado la factura a ", correo, llegada);

    const doc = confirmacion.querySelector(":scope > article");
    doc.querySelector("h2 em").textContent = p.numero;
    const datosFactura = doc.querySelectorAll(":scope > header dd");
    datosFactura[0].textContent = fechaLarga.format(new Date(p.fecha));
    datosFactura[1].textContent = p.numero.replace("TSM", "PED");
    datosFactura[2].textContent = p.pago.estado;

    const [, cliente, envio] = doc.querySelectorAll(":scope > section");
    const c = p.cliente;
    conSaltos(cliente.querySelector("p"), [
      c.razon, c.nif && `NIF ${c.nif}`, c.nombre, c.direccion, `${c.cp} ${c.ciudad}`, `${c.provincia}, España`, c.correo, c.telefono,
    ]);
    conSaltos(envio.querySelector("p"), [
      `${p.tipoEnvio}: ${p.envio ? T.dinero(p.envio) : "gratis"}`,
      p.metodo === "transferencia" ? "Se envía al recibir el pago" : `Llega ${p.entrega}`,
      p.pago.detalle,
    ]);

    doc.querySelector("tbody").replaceChildren(...p.lineas.map((l) => {
      const tr = crear("tr");
      const celda = crear("td");
      const figura = crear("figure");
      const img = crear("img");
      img.src = l.img;
      img.alt = "";
      figura.append(img);
      const texto = crear("p");
      texto.append(crear("strong", l.nombre), crear("small", `${l.tipo} · ${l.formato}`));
      celda.append(figura, texto);
      tr.append(celda, crear("td", l.cantidad), crear("td", T.dinero(l.precio)), crear("td", T.dinero(l.precio * l.cantidad)));
      return tr;
    }));

    const filas = [filaTotal("Subtotal", T.dinero(p.subtotal))];
    if (p.descuento) filas.push(filaTotal(`Descuento (${p.codigo})`, `−${T.dinero(p.descuento)}`));
    filas.push(
      filaTotal(p.tipoEnvio, p.envio ? T.dinero(p.envio) : "Gratis"),
      filaTotal("Base imponible", T.dinero(p.base)),
      filaTotal("IVA (21 %)", T.dinero(p.iva)),
      filaTotal("Total", T.dinero(p.total)),
    );
    doc.querySelector("tfoot").replaceChildren(...filas);
  }

  confirmacion.querySelector(":scope > p button").addEventListener("click", () => print());

  /* ---------- 6. Arranque ---------- */
  cambiarMetodo();
  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(CLAVE_PEDIDO)); } catch (error) { guardado = null; }
  if (location.hash === "#confirmacion" && guardado && !T.totales().unidades) {
    confirmado = true;
    pintarConfirmacion(guardado);
  } else {
    pintar();
  }
  document.addEventListener("bolsa:cambio", pintar);
})();
