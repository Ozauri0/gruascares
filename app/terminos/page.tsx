import InnerFooter from "../components/InnerFooter";

export const metadata = {
  title: "Términos y Privacidad | Grúas Cares",
};

export default function TerminosPage() {
  return (
    <>
      <main className="inner-page">
        <section className="page-intro wrap">
          <div>
            <p className="eyebrow">Información legal</p>
            <h1>
              Términos de uso y<br />
              <em>privacidad.</em>
            </h1>
          </div>
          <p>
            Condiciones de uso del sitio web, catálogo referencial, agendamiento de servicios y tratamiento de datos personales de Grúas Cares en Villarrica y la IX Región de la Araucanía.
          </p>
        </section>

        <section className="wrap terms-section">
          <div className="terms-grid">
            <article className="terms-card">
              <span>01</span>
              <h2>Alcance del sitio web</h2>
              <p>
                Este sitio web entrega información sobre los servicios de Grúas Cares (grúa de plataforma hidráulica, transporte de cargas pesadas, camiones grúa y serviteca/taller en Villarrica y la IX Región de la Araucanía), además de herramientas de contacto, solicitud de citas y consulta de productos.
              </p>
            </article>

            <article className="terms-card">
              <span>02</span>
              <h2>Solicitud de servicios y agenda</h2>
              <p>
                El envío de un formulario en la sección de agendamiento genera una <strong>solicitud de hora sujeta a confirmación</strong> por parte de nuestro equipo de taller o despacho de grúas. La solicitud no constituye una reserva confirmada hasta que el personal de Grúas Cares verifique la disponibilidad técnica y lo confirme al cliente.
              </p>
              <p>
                Para emergencias o asistencia en ruta las 24 horas, el canal de atención inmediata es el contacto telefónico directo al <a href="tel:+56991627809">+56 9 9162 7809</a>.
              </p>
            </article>

            <article className="terms-card">
              <span>03</span>
              <h2>Catálogo y carro de solicitud</h2>
              <p>
                Los precios, fotografías y niveles de stock publicados en el catálogo en línea son <strong>referenciales e informativos</strong>, y están sujetos a confirmación presencial en el local o por nuestros canales de contacto directo.
              </p>
              <p>
                Este sitio no realiza cobros ni procesa pagos en línea. El carro de productos arma únicamente una lista de consulta para solicitar disponibilidad por teléfono o WhatsApp; toda compra se coordina y concreta directamente con la tienda.
              </p>
            </article>

            <article className="terms-card">
              <span>04</span>
              <h2>Datos personales y privacidad</h2>
              <p>
                Al crear una cuenta en el portal de clientes, agendar un servicio o registrarse presencialmente en nuestro taller, recopilamos los datos necesarios para la atención: <strong>nombre, RUT, correo electrónico, teléfono de contacto, datos de los vehículos (patente, marca, modelo, año y kilometraje) e historial de informes técnicos</strong>.
              </p>
              <p>
                Estos datos se utilizan para identificar al titular, coordinar sus solicitudes de grúa o serviteca, enviar confirmaciones o recuperaciones de acceso por correo electrónico y mantener disponible su historial de atenciones.
              </p>
            </article>

            <article className="terms-card">
              <span>05</span>
              <h2>Cookies y almacenamiento local</h2>
              <p>
                El sitio utiliza únicamente una cookie técnica de sesión para mantener iniciada la cuenta del usuario de forma segura y almacenamiento local en el navegador para recordar los productos agregados al carro de consulta y la preferencia de modo día/noche.
              </p>
            </article>

            <article className="terms-card">
              <span>06</span>
              <h2>Contacto</h2>
              <p>
                Puedes actualizar tu nombre, teléfono, contraseña y vehículos registrados directamente desde tu cuenta en <a href="/portal/perfil">Mi perfil</a>, o escribirnos para cualquier consulta sobre tus datos a <a href="mailto:contacto@gruascares.cl">contacto@gruascares.cl</a> o <a href="mailto:administracion@gruascares.cl">administracion@gruascares.cl</a>.
              </p>
            </article>
          </div>
        </section>
      </main>
      <InnerFooter />
    </>
  );
}
