/* SIESTA · Horóscopo — Base de contenido
 *
 * Una sola fuente de verdad para los 12 signos.
 *
 * Estructura pensada para crecer: hoy `energia` es un texto fijo (perfil
 * permanente). Cuando el horóscopo pase a ser diario, se reemplaza ese campo
 * por una lectura traída de un JSON externo o del CMS, sin tocar ni el
 * layout ni la animación. Todo lo demás (retrato, sombra, vínculos) es
 * estable y no necesita mantenimiento.
 *
 * Fechas y palabras clave tomadas de los posters de la serie.
 * Las frases son las que ya existen en cada pieza: son el activo compartible.
 */

export const SIGNOS = [
  {
    id: 'aries',
    nombre: 'Aries',
    desde: [3, 21], hasta: [4, 19],
    fechas: '21 MAR — 19 ABR',
    elemento: 'Fuego',
    regente: 'Marte',
    modalidad: 'Cardinal',
    frase: 'Empuje sin pedir permiso.',
    palabras: ['Fuego', 'Iniciativa', 'Deseo', 'Valor'],
    animal: 'Carnero',
    retrato:
      'Arrancás antes de tener el plan completo, y casi siempre te sale bien. No porque improvises mejor que el resto, sino porque empezás mientras los demás todavía están calculando. Tu ventaja no es la fuerza: es el tiempo que ganás por no dudar.',
    energia:
      'Hay algo que venís postergando no por miedo sino por prolijidad: querés tenerlo perfecto antes de mostrarlo. Esta semana conviene lo contrario. Mostralo a medio hacer y dejá que el roce con la realidad termine de definirlo.',
    amor:
      'Te enamorás rápido y te aburrís de la tibieza, no de la persona. Cuando algo se apaga, fijate si lo que falta es deseo o simplemente conversación.',
    trabajo:
      'Sos bueno abriendo, no sosteniendo. Rodeate de gente que disfrute la parte que a vos te cansa, en vez de exigirte una paciencia que no tenés.',
    sombra:
      'Confundís velocidad con convicción. A veces avanzás para no quedarte quieto con algo que te incomoda.',
    afines: ['leo', 'sagitario', 'acuario'],
    numero: 9,
  },
  {
    id: 'tauro',
    nombre: 'Tauro',
    desde: [4, 20], hasta: [5, 20],
    fechas: '20 ABR — 20 MAY',
    elemento: 'Tierra',
    regente: 'Venus',
    modalidad: 'Fijo',
    frase: 'Lo simple también es extraordinario.',
    palabras: ['Paciencia', 'Placer', 'Estabilidad', 'Raíces'],
    animal: 'Toro',
    retrato:
      'No te apurás y eso confunde a la gente: creen que dudás cuando en realidad estás esperando que valga la pena. Cuando finalmente te movés, no volvés atrás. Tu terquedad no es un defecto de carácter, es un sistema de filtrado.',
    energia:
      'Estás defendiendo una rutina que ya no te da lo que te daba antes. Vale la pena separar qué parte te sostiene de verdad y qué parte conservás sólo porque cambiarla da trabajo.',
    amor:
      'Ofrecés constancia, que es más rara que la pasión y se agradece más tarde. Pero la constancia sin palabras se lee como indiferencia: decilo, no sólo lo demuestres.',
    trabajo:
      'Construís cosas que quedan. El problema aparece cuando confundís estabilidad con estancamiento y te quedás cuidando algo que ya terminó.',
    sombra:
      'Llamás lealtad a la resistencia al cambio. No siempre es lo mismo.',
    afines: ['virgo', 'capricornio', 'cancer'],
    numero: 6,
  },
  {
    id: 'geminis',
    nombre: 'Géminis',
    desde: [5, 21], hasta: [6, 20],
    fechas: '21 MAY — 20 JUN',
    elemento: 'Aire',
    regente: 'Mercurio',
    modalidad: 'Mutable',
    frase: 'Dos mundos, una misma verdad.',
    palabras: ['Curiosidad', 'Versatilidad', 'Conexión', 'Ideas'],
    animal: 'Los gemelos',
    retrato:
      'Podés defender dos posiciones opuestas con la misma honestidad, y eso incomoda a quienes necesitan que la gente sea una sola cosa. No estás fingiendo: estás viendo más lados que el resto. El costo es que a veces vos tampoco sabés dónde quedaste parado.',
    energia:
      'Tenés demasiadas conversaciones abiertas y ninguna terminada. Cerrá tres esta semana, aunque sea mal. El alivio de soltar va a ser mayor que el de resolver.',
    amor:
      'Necesitás que te sigan el ritmo mental antes que el emocional. Alguien que te hace pensar te retiene más que alguien que sólo te quiere.',
    trabajo:
      'Sos la persona que conecta lo que nadie había conectado. Lo que te falta no es talento: es quedarte lo suficiente como para ver un proyecto terminar.',
    sombra:
      'Usás la ironía para no tener que decir lo que sentís. Funciona, y ese es el problema.',
    afines: ['libra', 'acuario', 'aries'],
    numero: 5,
  },
  {
    id: 'cancer',
    nombre: 'Cáncer',
    desde: [6, 21], hasta: [7, 22],
    fechas: '21 JUN — 22 JUL',
    elemento: 'Agua',
    regente: 'Luna',
    modalidad: 'Cardinal',
    frase: 'Sentir también es fuerza.',
    palabras: ['Intuición', 'Protección', 'Memoria', 'Hogar'],
    animal: 'Cangrejo',
    retrato:
      'Te acordás de todo: de quién estuvo, de quién no, del tono exacto con el que te dijeron algo hace años. Esa memoria te vuelve leal y también te complica. Cuidás a los demás con una precisión que rara vez pedís para vos.',
    energia:
      'Estás gastando energía en sostener a alguien que no te está preguntando cómo estás. No hace falta un portazo: alcanza con dejar de adelantarte a sus necesidades por un tiempo.',
    amor:
      'Das refugio antes de que te lo pidan. Revisá si estás eligiendo a alguien o si estás eligiendo ser necesario, porque no se parecen tanto como creés.',
    trabajo:
      'Leés el clima de un equipo mejor que cualquier métrica. Ese trabajo invisible existe, y conviene que alguien además de vos lo sepa.',
    sombra:
      'Te retirás en silencio y esperás que noten la ausencia. A veces nadie nota nada, y la bronca se acumula sola.',
    afines: ['escorpio', 'piscis', 'tauro'],
    numero: 2,
  },
  {
    id: 'leo',
    nombre: 'Leo',
    desde: [7, 23], hasta: [8, 22],
    fechas: '23 JUL — 22 AGO',
    elemento: 'Fuego',
    regente: 'Sol',
    modalidad: 'Fijo',
    frase: 'Brillás aunque no hagas ruido.',
    palabras: ['Creatividad', 'Presencia', 'Confianza', 'Vida'],
    animal: 'León',
    retrato:
      'Ocupás espacio sin proponértelo. Entrás a un lugar y algo se reacomoda, y después te preguntan por qué. No es ego: es que te tomás en serio lo que hacés, y esa seriedad se nota.',
    energia:
      'Estás esperando un reconocimiento que probablemente no llegue en la forma que imaginaste. Cobralo distinto: pedí algo concreto en vez de esperar que lo ofrezcan.',
    amor:
      'Sos generoso hasta que dejan de mirarte, y ahí te enfriás de golpe. Vale preguntarse si querés que te elijan o que te aplaudan.',
    trabajo:
      'Funcionás mejor cuando tu nombre está asociado a lo que hacés. No es vanidad, es cómo trabajás: buscá roles donde la autoría sea visible.',
    sombra:
      'Confundís que no te vean con que no te quieran. Casi nunca es eso.',
    afines: ['aries', 'sagitario', 'libra'],
    numero: 1,
  },
  {
    id: 'virgo',
    nombre: 'Virgo',
    desde: [8, 23], hasta: [9, 22],
    fechas: '23 AGO — 22 SEP',
    elemento: 'Tierra',
    regente: 'Mercurio',
    modalidad: 'Mutable',
    frase: 'En los detalles también habita lo esencial.',
    palabras: ['Análisis', 'Claridad', 'Servicio', 'Orden'],
    animal: 'La doncella',
    retrato:
      'Ves el error antes que nadie y te cuesta no decirlo. Tu atención al detalle no es manía: es una forma de cuidado que la mayoría no reconoce porque sólo se nota cuando falta.',
    energia:
      'Estás corrigiendo algo que ya está bien. El rendimiento de seguir ajustando es cada vez menor. Entregalo y usá ese tiempo en algo que todavía no empezaste.',
    amor:
      'Demostrás afecto resolviendo problemas. Es real, pero no siempre se recibe como cariño. A veces hay que decirlo con palabras aunque suene obvio.',
    trabajo:
      'Sos el control de calidad de cualquier equipo. Cuidado con volverte el cuello de botella por no delegar lo que otro haría un 90% igual de bien.',
    sombra:
      'La autocrítica no te hace mejor, te hace más lento. Confundiste una cosa con la otra hace bastante.',
    afines: ['tauro', 'capricornio', 'cancer'],
    numero: 4,
  },
  {
    id: 'libra',
    nombre: 'Libra',
    desde: [9, 23], hasta: [10, 22],
    fechas: '23 SEP — 22 OCT',
    elemento: 'Aire',
    regente: 'Venus',
    modalidad: 'Cardinal',
    frase: 'Equilibrio sin dejarte atrás.',
    palabras: ['Aire', 'Armonía', 'Belleza', 'Vínculo'],
    animal: 'La balanza',
    retrato:
      'Tenés un radar para la injusticia y una alergia al conflicto, que es una combinación difícil de llevar. Ves con claridad lo que está desbalanceado y después negociás con vos mismo para no tener que decirlo.',
    energia:
      'Hay una decisión que venís postergando porque cualquier opción deja a alguien afuera. Va a seguir siendo así dentro de un mes. Elegí ahora y ahorrate la espera.',
    amor:
      'Te adaptás tanto que a veces la otra persona nunca llega a conocerte. Mostrá una preferencia, aunque sea chica, aunque incomode.',
    trabajo:
      'Sos quien logra que dos posiciones opuestas se escuchen. Eso vale mucho y se paga poco: aprendé a nombrarlo como trabajo y no como carácter.',
    sombra:
      'Llamás diplomacia a no decir lo que pensás. La cuenta llega después, toda junta.',
    afines: ['geminis', 'acuario', 'leo'],
    numero: 7,
  },
  {
    id: 'escorpio',
    nombre: 'Escorpio',
    desde: [10, 23], hasta: [11, 21],
    fechas: '23 OCT — 21 NOV',
    elemento: 'Agua',
    regente: 'Plutón',
    modalidad: 'Fijo',
    frase: 'Lo profundo también es parte de la luz.',
    palabras: ['Intensidad', 'Transformación', 'Verdad', 'Poder'],
    animal: 'Escorpión',
    retrato:
      'No te interesa la superficie de nada ni de nadie. Preguntás lo que otros evitan y sostenés silencios que la mayoría necesita llenar. La gente te cuenta cosas que no le cuenta a nadie, y no sabe bien por qué.',
    energia:
      'Sabés algo que todavía no dijiste, y el peso de guardarlo ya es mayor que el riesgo de decirlo. Lo que estás protegiendo probablemente no sea tan frágil como creés.',
    amor:
      'O entrás entero o no entrás. El problema no es la intensidad: es que pedís una prueba de lealtad antes de dar la tuya.',
    trabajo:
      'Detectás lo que nadie quiere nombrar en una organización. Usalo para desarmar problemas, no para acumular información sobre la gente.',
    sombra:
      'Confundís profundidad con control. No todo lo que entendés de alguien te pertenece.',
    afines: ['cancer', 'piscis', 'capricornio'],
    numero: 8,
  },
  {
    id: 'sagitario',
    nombre: 'Sagitario',
    desde: [11, 22], hasta: [12, 21],
    fechas: '22 NOV — 21 DIC',
    elemento: 'Fuego',
    regente: 'Júpiter',
    modalidad: 'Mutable',
    frase: 'Ir más allá es volver a vos.',
    palabras: ['Expansión', 'Libertad', 'Aventura', 'Sentido'],
    animal: 'Centauro',
    retrato:
      'Necesitás que las cosas signifiquen algo o te vas. No te aburre la rutina: te aburre la rutina sin propósito. Decís la verdad de frente y después te sorprende que haya dolido, porque en tu cabeza sólo estabas siendo claro.',
    energia:
      'Estás por irte de algo antes de haber entendido qué te molesta. Quedate una semana más con la incomodidad. Si después seguís queriendo irte, andá tranquilo.',
    amor:
      'La libertad no se te negocia, y está bien. Pero libertad no significa no comprometerse: significa elegir todos los días, que es más difícil.',
    trabajo:
      'Funcionás cuando ves el horizonte completo. En trabajos donde sólo te dan la tarea de hoy, te apagás rápido y nadie entiende por qué.',
    sombra:
      'Usás la sinceridad como permiso para no medir el impacto.',
    afines: ['aries', 'leo', 'geminis'],
    numero: 3,
  },
  {
    id: 'capricornio',
    nombre: 'Capricornio',
    desde: [12, 22], hasta: [1, 19],
    fechas: '22 DIC — 19 ENE',
    elemento: 'Tierra',
    regente: 'Saturno',
    modalidad: 'Cardinal',
    frase: 'Los sueños se construyen.',
    palabras: ['Disciplina', 'Estructura', 'Ambición', 'Realidad'],
    animal: 'Cabra',
    retrato:
      'Pensás en plazos que a los demás les parecen absurdos. Estás dispuesto a que algo tarde diez años si el resultado lo vale, y esa paciencia te da una ventaja que casi nadie sostiene. Lo que te falta no es voluntad.',
    energia:
      'Cumpliste con todo lo que te propusiste y seguís con la sensación de que no alcanza. El problema no es la meta: es que moviste la vara antes de festejar la anterior. Parate un segundo ahí.',
    amor:
      'Mostrás afecto asumiendo responsabilidades. Hermoso, y también agotador. Dejá que alguien se ocupe de vos sin devolverle el favor inmediatamente.',
    trabajo:
      'Sos de los pocos que terminan lo que empiezan. Cuidado con medir tu valor únicamente por lo que producís, porque esa cuenta nunca cierra.',
    sombra:
      'Postergaste el disfrute tantas veces que ya no sabés bien cómo era.',
    afines: ['tauro', 'virgo', 'escorpio'],
    numero: 10,
  },
  {
    id: 'acuario',
    nombre: 'Acuario',
    desde: [1, 20], hasta: [2, 18],
    fechas: '20 ENE — 18 FEB',
    elemento: 'Aire',
    regente: 'Urano',
    modalidad: 'Fijo',
    frase: 'Otro mundo también es posible.',
    palabras: ['Originalidad', 'Cambio', 'Comunidad', 'Futuro'],
    animal: 'El ánfora',
    retrato:
      'Ves el sistema completo mientras los demás discuten una parte. Te importa la gente en general con una intensidad que a veces no le dedicás a la gente concreta que tenés al lado. Pensás diez años adelante y eso te deja solo en el presente.',
    energia:
      'Tenés una idea que estás guardando porque te parece demasiado rara para decirla en voz alta. Es exactamente la que hace falta. Decila sin pedir disculpas antes.',
    amor:
      'Necesitás distancia para querer bien, y eso no es frialdad. Pero conviene avisarlo, porque desde afuera se parece bastante a desinterés.',
    trabajo:
      'Sos quien propone lo que todavía no existe. Buscá al menos una persona que ejecute, porque la idea sola no se sostiene.',
    sombra:
      'Defendés causas a distancia y te cuesta la conversación difícil con quien tenés cerca.',
    afines: ['geminis', 'libra', 'sagitario'],
    numero: 11,
  },
  {
    id: 'piscis',
    nombre: 'Piscis',
    desde: [2, 19], hasta: [3, 20],
    fechas: '19 FEB — 20 MAR',
    elemento: 'Agua',
    regente: 'Neptuno',
    modalidad: 'Mutable',
    frase: 'Lo invisible también guía.',
    palabras: ['Sensibilidad', 'Imaginación', 'Empatía', 'Espiritualidad'],
    animal: 'Los peces',
    retrato:
      'Absorbés el estado de ánimo de cualquier lugar en el que entrás, y muchas veces lo confundís con el tuyo. Esa permeabilidad te hace entender a la gente sin que te expliquen nada, y también te deja cansado sin motivo aparente.',
    energia:
      'Parte de lo que venís cargando esta semana no es tuyo. Separá qué preocupación te pertenece y cuál absorbiste de otro. La diferencia se nota apenas te lo preguntás en serio.',
    amor:
      'Idealizás rápido y después te decepcionás con la persona real, que nunca hizo nada malo. Mirá a quien está, no a quien proyectaste.',
    trabajo:
      'Tu intuición es un método, aunque no puedas explicarla en una reunión. Anotá tus corazonadas y revisalas después: vas a ver que acertás más de lo que creés.',
    sombra:
      'Te escapás antes de que las cosas se pongan difíciles y lo llamás sensibilidad.',
    afines: ['cancer', 'escorpio', 'tauro'],
    numero: 12,
  },
];

/** Símbolo Unicode de cada signo, usado cuando no hay glifo propio dibujado. */
export const GLIFOS_UNICODE = {
  aries: '♈', tauro: '♉', geminis: '♊', cancer: '♋',
  leo: '♌', virgo: '♍', libra: '♎', escorpio: '♏',
  sagitario: '♐', capricornio: '♑', acuario: '♒', piscis: '♓',
};

/**
 * Signos que ya tienen arte propia exportada con alpha.
 * Al sumar los archivos a /assets/img/ se agrega el id acá y la pieza
 * pasa de placeholder tipográfico a la ilustración real.
 */
export const ARTE_DISPONIBLE = {
  aries: { glifo: true, animal: false },
};

const INDICE = Object.fromEntries(SIGNOS.map((s) => [s.id, s]));

/** Devuelve un signo por su id, o null. */
export function porId(id) {
  return INDICE[id] || null;
}

/**
 * Calcula el signo a partir de día y mes (mes 1-12).
 * Capricornio cruza el fin de año, así que se compara distinto.
 */
export function signoDe(dia, mes) {
  return (
    SIGNOS.find((s) => {
      const [mDesde, dDesde] = s.desde;
      const [mHasta, dHasta] = s.hasta;
      const empieza = mes === mDesde && dia >= dDesde;
      const termina = mes === mHasta && dia <= dHasta;
      return empieza || termina;
    }) || null
  );
}

/** Días que tiene un mes, sin depender del año (febrero = 29 para permitir bisiestos). */
export function diasDelMes(mes) {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] || 31;
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
