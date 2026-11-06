import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, Alert, Modal, 
  SafeAreaView, StatusBar, TextInput, Image, ScrollView, ActivityIndicator 
} from 'react-native';
import MapView, { Marker, Circle, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { db } from './src/config/firebase';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { calculateDistance } from './src/utils/geo';

export default function App() {
  const [userLocation, setUserLocation] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [activeWarning, setActiveWarning] = useState(null);
  
  // Estado para el modal de nuevo reporte
  const [modalVisible, setModalVisible] = useState(false);
  const [speciesName, setSpeciesName] = useState('');
  const [category, setCategory] = useState('Enjambre / Abejas');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Monitoreo GPS en tiempo real
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Se requiere acceso al GPS para activar el BioRadar.');
        return;
      }

      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 3,
        },
        (location) => {
          const { latitude, longitude } = location.coords;
          setUserLocation({ latitude, longitude });
        }
      );
    })();
  }, []);

  // 2. Escuchar reportes en tiempo real desde Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'reports'), (snapshot) => {
      const reportsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAlerts(reportsList);
    }, (error) => {
      console.error("Error en Firestore:", error);
    });

    return () => unsubscribe();
  }, []);

  // 3. Proximidad del radar (< 300m dispara advertencia)
  useEffect(() => {
    if (!userLocation || alerts.length === 0) return;

    for (let alertItem of alerts) {
      if (!alertItem.latitude || !alertItem.longitude) continue;

      const distKm = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        alertItem.latitude,
        alertItem.longitude
      );

      if (distKm <= 0.3) {
        setActiveWarning({
          ...alertItem,
          distanceMeters: Math.round(distKm * 1000)
        });
        break;
      }
    }
  }, [userLocation, alerts]);

  // Selección de Foto (Cámara o Galería)
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permiso requerido', 'Se necesita acceso a tus fotos.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true, // Se guarda base64 para visualizarla de inmediato sin almacenamiento externo extra
    });

    if (!result.canceled) {
      setImageUri(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  // Guardar reporte con Foto y Nombre personalizado
  const handleSaveReport = async () => {
    if (!speciesName.trim()) {
      Alert.alert('Campo requerido', 'Por favor ingresa el nombre de la especie u observación.');
      return;
    }
    if (!userLocation) {
      Alert.alert('Esperando GPS', 'Obteniendo tu coordenada exacta...');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        title: speciesName,
        category: category,
        description: description,
        image: imageUri || null,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        createdAt: serverTimestamp()
      });

      // Limpiar formulario y cerrar
      setSpeciesName('');
      setDescription('');
      setImageUri(null);
      setModalVisible(false);
      Alert.alert('¡Misión Generada!', 'Especie registrada en el BioRadar geográfico.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo subir la especie: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BioRadar 📡</Text>
        <Text style={styles.headerSub}>Sensor Ambiental Humano</Text>
      </View>

      {/* Mapa Principal */}
      {userLocation ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          showsUserLocation={true}
          followsUserLocation={true}
        >
          {/* Radio de detección de 2 Km */}
          <Circle
            center={userLocation}
            radius={2000}
            fillColor="rgba(16, 185, 129, 0.15)"
            strokeColor="rgba(16, 185, 129, 0.6)"
            strokeWidth={2}
          />

          {/* Marcadores de especies guardadas */}
          {alerts.map((item) => (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.latitude, longitude: item.longitude }}
              pinColor={item.category.includes('Enjambre') ? 'yellow' : 'red'}
            >
              <Callout style={styles.calloutBox}>
                <Text style={styles.calloutTitle}>{item.title}</Text>
                <Text style={styles.calloutCat}>{item.category}</Text>
                {item.description ? <Text style={styles.calloutDesc}>{item.description}</Text> : null}
                {item.image && (
                  <Image source={{ uri: item.image }} style={styles.calloutImage} />
                )}
              </Callout>
            </Marker>
          ))}
        </MapView>
      ) : (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Conectando señal GPS de estudiante...</Text>
        </View>
      )}

      {/* Botón Flotante para Generar Reporte */}
      <TouchableOpacity 
        style={styles.fabBtn}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabBtnText}>📸 + Reportar Especie / Peligro</Text>
      </TouchableOpacity>

      {/* MODAL DE REGISTRO (NOMBRE, FOTO, CATEGORÍA) */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formTitle}>🌱 Registrar Nueva Especie</Text>

              <Text style={styles.label}>Nombre de la Especie / Evento:</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Enjambre de abejas, Caracol Gigante, Hongo..."
                placeholderTextColor="#64748b"
                value={speciesName}
                onChangeText={setSpeciesName}
              />

              <Text style={styles.label}>Categoría:</Text>
              <View style={styles.categoryContainer}>
                {['Enjambre / Abejas', 'Especie Invasora', 'Fauna / Ave', 'Hongo / Planta'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, category === cat && styles.catChipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Detalles o Advertencia:</Text>
              <TextInput
                style={[styles.input, { height: 70 }]}
                placeholder="Ej. Enjambre en árbol junto a las canchas..."
                placeholderTextColor="#64748b"
                multiline
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.label}>Fotografía de la Evidencia:</Text>
              <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                <Text style={styles.photoBtnText}>
                  {imageUri ? '📷 Cambiar Fotografía' : '📷 Adjuntar Foto desde Galería'}
                </Text>
              </TouchableOpacity>

              {imageUri && (
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
              )}

              <View style={styles.formActions}>
                <TouchableOpacity 
                  style={styles.cancelBtn} 
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.submitBtn} 
                  onPress={handleSaveReport}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.submitBtnText}>Publicar Radar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL DE ADVERTENCIA DE PROXIMIDAD */}
      <Modal visible={!!activeWarning} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderColor: '#ef4444', borderWidth: 2 }]}>
            <Text style={styles.alertHeader}>⚠️ ¡ALERTA DE PROXIMIDAD!</Text>
            <Text style={styles.alertTitle}>{activeWarning?.title}</Text>
            <Text style={styles.alertSubCat}>Tipo: {activeWarning?.category}</Text>
            <Text style={styles.alertDistance}>
              Detectado a solo <Text style={{ color: '#f59e0b', fontWeight: 'bold' }}>{activeWarning?.distanceMeters} metros</Text> de ti.
            </Text>
            {activeWarning?.image && (
              <Image source={{ uri: activeWarning.image }} style={styles.warningImage} />
            )}
            <TouchableOpacity 
              style={styles.dismissBtn} 
              onPress={() => setActiveWarning(null)}
            >
              <Text style={styles.dismissBtnText}>Entendido / Alejarse</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 16, backgroundColor: '#1e293b', elevation: 4 },
  headerTitle: { color: '#38bdf8', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#94a3b8', fontSize: 13 },
  map: { flex: 1 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#38bdf8', marginTop: 12, fontSize: 15 },
  fabBtn: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: '#10b981', padding: 16, borderRadius: 14, alignItems: 'center', elevation: 8 },
  fabBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 17 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#1e293b', padding: 20, borderRadius: 18, maxHeight: '90%' },
  formTitle: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  label: { color: '#cbd5e1', fontSize: 14, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#334155' },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  catChip: { backgroundColor: '#334155', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  catChipActive: { backgroundColor: '#38bdf8' },
  catText: { color: '#cbd5e1', fontSize: 12 },
  catTextActive: { color: '#0f172a', fontWeight: 'bold' },
  photoBtn: { backgroundColor: '#334155', padding: 12, borderRadius: 8, alignItems: 'center', marginVertical: 8 },
  photoBtnText: { color: '#38bdf8', fontWeight: 'bold' },
  previewImage: { width: '100%', height: 160, borderRadius: 8, marginVertical: 8 },
  formActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 10 },
  cancelBtn: { flex: 1, backgroundColor: '#475569', padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtnText: { color: '#fff', fontWeight: 'bold' },
  submitBtn: { flex: 1, backgroundColor: '#10b981', padding: 14, borderRadius: 10, alignItems: 'center' },
  submitBtnText: { color: '#000', fontWeight: 'bold' },
  calloutBox: { width: 160, padding: 5, alignItems: 'center' },
  calloutTitle: { fontWeight: 'bold', fontSize: 14 },
  calloutCat: { fontSize: 11, color: '#0284c7' },
  calloutDesc: { fontSize: 10, color: '#475569' },
  calloutImage: { width: 140, height: 90, borderRadius: 6, marginTop: 4 },
  alertHeader: { color: '#ef4444', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  alertTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginTop: 6 },
  alertSubCat: { color: '#94a3b8', textAlign: 'center', marginBottom: 6 },
  alertDistance: { color: '#cbd5e1', fontSize: 15, textAlign: 'center', marginBottom: 12 },
  warningImage: { width: '100%', height: 140, borderRadius: 10, marginBottom: 14 },
  dismissBtn: { backgroundColor: '#10b981', padding: 12, borderRadius: 10, alignItems: 'center' },
  dismissBtnText: { color: '#fff', fontWeight: 'bold' }
});