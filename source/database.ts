import * as crypto from "crypto";
import * as stream from "stream";
import * as typedFirestore from "typed-admin-firestore";
import * as admin from "firebase-admin";
import { AxiosResponse } from "axios";
import axios from "axios";
import { URL } from "url";

const app = admin.initializeApp();

const database = (app.firestore() as unknown) as typedFirestore.Firestore<{
  lineLoginState: {
    key: string;
    value: StateData;
    subCollections: {};
  };
  user: {
    key: UserId;
    value: UserData;
    subCollections: {};
  };
  class: {
    key: ClassId;
    value: ClassData;
    subCollections: {};
  };
  room: {
    key: RoomId;
    value: RoomData;
    subCollections: {};
  };
}>;

type StateData = {
  createdAt: admin.firestore.Timestamp;
};

const storageDefaultBucket = app.storage().bucket();

export type UserData = {
  name: string;
  lineUserId: LineUserId;
  imageFileHash: FileHash;
  lastIssuedAccessTokenHash: AccessTokenHash;
  classInTimeTable: ClassOfWeek;
  createdAt: admin.firestore.Timestamp;
};

export type ClassOfWeek = {
  [key in Week]: ClassOfDay;
};

export type ClassOfDay = {
  [key in Time]: ClassId | null;
};

export type ClassOfWeekOutType = {
  [weekKey in Week]: ClassOfDayOutType;
};

export type ClassOfDayOutType = {
  [timeKey in Time]: {
    id: ClassId;
  } | null;
};

const classIdMaybeToClassOutTypeMaybe = (
  classId: null | ClassId
): { id: ClassId } | null => {
  if (classId === null) {
    return null;
  }
  return { id: classId };
};

const classOfDayToOutType = (classOfDay: ClassOfDay): ClassOfDayOutType => ({
  class1: classIdMaybeToClassOutTypeMaybe(classOfDay.class1),
  class2: classIdMaybeToClassOutTypeMaybe(classOfDay.class2),
  class3: classIdMaybeToClassOutTypeMaybe(classOfDay.class3),
  class4: classIdMaybeToClassOutTypeMaybe(classOfDay.class4),
  class5: classIdMaybeToClassOutTypeMaybe(classOfDay.class5)
});

const classOfWeekToOutType = (
  classOfWeek: ClassOfWeek
): ClassOfWeekOutType => ({
  monday: classOfDayToOutType(classOfWeek.monday),
  tuesday: classOfDayToOutType(classOfWeek.tuesday),
  wednesday: classOfDayToOutType(classOfWeek.wednesday),
  thursday: classOfDayToOutType(classOfWeek.thursday),
  friday: classOfDayToOutType(classOfWeek.friday),
  saturday: classOfDayToOutType(classOfWeek.saturday)
});

export type Week =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type ClassData = {
  name: string;
  teacher: string;
  room: RoomId;
  weekAndTime: {
    week: Week;
    time: Time;
  };
};

export type WeekAndTime = {
  week: Week;
  time: Time;
};

export type Time = "class1" | "class2" | "class3" | "class4" | "class5";

export type RoomData = {
  name: string;
};

export type BuildingNumber =
  | "building1"
  | "building2"
  | "building3"
  | "building4"
  | "building5";

export type UserId = string & { _userId: never };

export type LineUserId = string & { _lineUserId: never };

export type FileHash = string & { _fileHash: never };

export type AccessToken = string & { _accessToken: never };

export type AccessTokenHash = string & { _accessTokenHash: never };

export type ClassId = string & { _classId: never };

export type RoomId = string & { _roomId: never };
/**
 * ランダムなIDを生成する
 */
const createRandomId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

/**
 * LINEログインのstateを保存する
 */
export const generateAndWriteLineLoginState = async (): Promise<string> => {
  const state = createRandomId();
  await database
    .collection("lineLoginState")
    .doc(state)
    .create({
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
  return state;
};

/**
 * ソーシャルログイン stateが存在することを確認し、存在するなら削除する
 */
export const checkExistsAndDeleteState = async (
  state: string
): Promise<boolean> => {
  const docRef = database.collection("lineLoginState").doc(state);
  const data = (await docRef.get()).data();
  if (data !== undefined) {
    await docRef.delete();
    return true;
  }
  return false;
};

export type UserOutType = Pick<UserData, "imageFileHash" | "name"> & {
  id: UserId;
  classInTimeTable: ClassOfWeekOutType;
};

export const getUser = async (
  id: UserId
): Promise<{
  name: string;
  classInTimeTable: ClassOfWeekOutType;
  imageFileHash: FileHash;
}> => {
  const data = (
    await database
      .collection("user")
      .doc(id)
      .get()
  ).data();
  if (data === undefined) {
    throw new Error(`userId ${id} dose not exits`);
  }
  return {
    name: data.name,
    classInTimeTable: classOfWeekToOutType(data.classInTimeTable),
    imageFileHash: data.imageFileHash
  };
};

/**
 * LINEのUserIDからユーザーを探す
 * @param lineUserId
 */
export const getUserFromLineAccountId = async (
  lineUserId: LineUserId
): Promise<{ id: UserId; data: UserData } | null> => {
  const querySnapShot = await database
    .collection("user")
    .where("lineUserId", "==", lineUserId)
    .get();
  if (querySnapShot.docs.length === 0) {
    return null;
  }

  const queryDocumentSnapshot = querySnapShot.docs[0];
  return {
    id: queryDocumentSnapshot.id as UserId,
    data: queryDocumentSnapshot.data()
  };
};

export const createHashFromBuffer = (
  data: Buffer,
  mimeType: string
): FileHash =>
  crypto
    .createHash("sha256")
    .update(data)
    .update(mimeType, "utf8")
    .digest("hex") as FileHash;

/**
 * アクセストークンを生成する
 */
const createAccessToken = (): AccessToken => {
  return crypto.randomBytes(24).toString("hex") as AccessToken;
};

const accessTokenToTypedArray = (accessToken: AccessToken): Uint8Array => {
  const binary = new Uint8Array(24);
  for (let i = 0; i < 24; i++) {
    binary[i] = Number.parseInt(accessToken.slice(i, i + 2), 16);
  }
  return binary;
};

/**
 * アクセストークンのハッシュ値を生成する
 * @param accessToken
 */
export const hashAccessToken = (accessToken: AccessToken): AccessTokenHash =>
  crypto
    .createHash("sha256")
    .update(accessTokenToTypedArray(accessToken))
    .digest("hex") as AccessTokenHash;

/**
 * 教室のデータを取得する
 */
export const getRoomData = async (id: RoomId): Promise<RoomData> => {
  const data = (
    await database
      .collection("room")
      .doc(id)
      .get()
  ).data();
  if (data === undefined) {
    throw new Error(`roomId ${id} dose not exists`);
  }
  return data;
};

/**
 * すべての教室のデータを取得する
 */
export const getAllRoomData = async (): Promise<Array<
  { id: RoomId } & RoomData
>> => {
  const dataList = await database.collection("room").get();
  return dataList.docs.map(doc => ({
    id: doc.id as RoomId,
    name: doc.data().name
  }));
};

/**
 * 授業のデータを取得する
 */
export const getClassData = async (
  id: ClassId
): Promise<{
  name: string;
  teacher: string;
  room: { id: RoomId };
  weekAndTime: WeekAndTime;
}> => {
  const data = (
    await database
      .collection("class")
      .doc(id)
      .get()
  ).data();
  if (data === undefined) {
    throw new Error(`classId ${id} dose not exists`);
  }
  return {
    name: data.name,
    room: { id: data.room },
    teacher: data.teacher,
    weekAndTime: data.weekAndTime
  };
};

/**
 * すべての授業のデータを取得する
 */
export const getAllClassData = async (): Promise<Array<{
  id: ClassId;
  name: string;
  teacher: string;
  room: { id: RoomId };
  weekAndTime: WeekAndTime;
}>> => {
  const dataList = await database.collection("class").get();
  return dataList.docs.map(doc => {
    const docData = doc.data();
    return {
      id: doc.id as ClassId,
      name: docData.name,
      teacher: docData.teacher,
      room: {
        id: docData.room
      },
      weekAndTime: docData.weekAndTime
    };
  });
};

/**
 * Firebase Cloud Storage にファイルを保存する
 * @returns ハッシュ値
 */
const saveFile = async (
  buffer: Buffer,
  mimeType: string
): Promise<FileHash> => {
  const hash = createHashFromBuffer(buffer, mimeType);
  const file = storageDefaultBucket.file(hash);
  await file.save(buffer, { contentType: mimeType });
  return hash as FileHash;
};

/**
 * 画像をURLからFirebase Cloud Storageに保存する
 * @param url 画像を配信しているURL
 */
const saveUserImageFromUrl = async (url: URL): Promise<FileHash> => {
  const response: AxiosResponse<Buffer> = await axios.get(url.toString(), {
    responseType: "arraybuffer"
  });
  const mimeType: string = response.headers["content-type"];
  return await saveFile(response.data, mimeType);
};

/**
 * 新たにユーザーを作成する
 * @param name ユーザー名
 * @param imageUrl ユーザーの画像を取得できるURL
 */
export const createUser = async (
  name: string,
  imageUrl: URL,
  lineUserId: LineUserId
): Promise<AccessToken> => {
  const userId = createRandomId() as UserId;
  const imageFileHash = await saveUserImageFromUrl(imageUrl);
  const accessToken = createAccessToken();
  await database
    .collection("user")
    .doc(userId)
    .create({
      name: name,
      createdAt: admin.firestore.Timestamp.fromDate(new Date()),
      imageFileHash: imageFileHash,
      lastIssuedAccessTokenHash: hashAccessToken(accessToken),
      lineUserId: lineUserId,
      classInTimeTable: {
        monday: {
          class1: null,
          class2: null,
          class3: null,
          class4: null,
          class5: null
        },
        tuesday: {
          class1: null,
          class2: null,
          class3: null,
          class4: null,
          class5: null
        },
        wednesday: {
          class1: null,
          class2: null,
          class3: null,
          class4: null,
          class5: null
        },
        thursday: {
          class1: null,
          class2: null,
          class3: null,
          class4: null,
          class5: null
        },
        friday: {
          class1: null,
          class2: null,
          class3: null,
          class4: null,
          class5: null
        },
        saturday: {
          class1: null,
          class2: null,
          class3: null,
          class4: null,
          class5: null
        }
      }
    });
  return accessToken;
};

/**
 * ユーザーのアクセストークンを更新する
 */
export const updateAccessToken = async (
  userId: UserId
): Promise<AccessToken> => {
  const newAccessToken = createAccessToken();
  await database
    .collection("user")
    .doc(userId)
    .update({
      lastIssuedAccessTokenHash: hashAccessToken(newAccessToken)
    });
  return newAccessToken;
};

export const verifyAccessTokenAndGetUserData = async (
  accessToken: AccessToken
): Promise<UserOutType> => {
  const accessTokenHash = hashAccessToken(accessToken);
  const document = (
    await database
      .collection("user")
      .where("lastIssuedAccessTokenHash", "==", accessTokenHash)
      .get()
  ).docs[0];
  if (document === undefined) {
    throw new Error(
      "他の端末でログインされたのでアクセストークンが無効になりました"
    );
  }
  const data = document.data();
  return {
    id: document.id as UserId,
    name: data.name,
    imageFileHash: data.imageFileHash,
    classInTimeTable: classOfWeekToOutType(data.classInTimeTable)
  };
};

/**
 * 時間割表の登録を上書きする
 */
export const setClass = async (
  accessToken: AccessToken,
  week: Week,
  time: Time,
  classId: ClassId | null
): Promise<UserOutType> => {
  const userData = await verifyAccessTokenAndGetUserData(accessToken);
  await database
    .collection("user")
    .doc(userData.id)
    .set(
      { classInTimeTable: { [week]: { [time]: classId } } },
      { merge: true }
    );
  return {
    ...userData,
    classInTimeTable: {
      ...userData.classInTimeTable,
      [week]: {
        ...userData.classInTimeTable[week],
        [time]: classIdMaybeToClassOutTypeMaybe(classId)
      }
    }
  };
};

/**
 * Firebase Cloud Storageからファイルを読み込むReadable Streamを取得する
 * @param fileHash ファイルハッシュ
 */
export const getReadableStream = (fileHash: FileHash): stream.Readable => {
  return storageDefaultBucket.file(fileHash).createReadStream();
};
