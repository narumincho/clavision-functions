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

export type UserOutType = Pick<
  UserData,
  "classInTimeTable" | "imageFileHash" | "name"
> & {
  id: UserId;
};

export const getUser = async (
  id: UserId
): Promise<{
  name: string;
  classInTimeTable: ClassOfWeek;
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
    classInTimeTable: data.classInTimeTable,
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
): Promise<{
  id: UserId;
  name: string;
  imageFileHash: FileHash;
  classInTimeTable: ClassOfWeek;
}> => {
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
    classInTimeTable: data.classInTimeTable
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
        [time]: classId
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

/*
 *
 */
const roomList = {
  "2603": { key: createRandomId() as RoomId },
  "2601": { key: createRandomId() as RoomId },
  "2605": { key: createRandomId() as RoomId },
  "21001": { key: createRandomId() as RoomId },
  "2701": { key: createRandomId() as RoomId },
  丹羽ホール: { key: createRandomId() as RoomId },
  "2703": { key: createRandomId() as RoomId },
  "1225": { key: createRandomId() as RoomId },
  "2802A": { key: createRandomId() as RoomId },
  "2502": { key: createRandomId() as RoomId },
  FI科演習室: { key: createRandomId() as RoomId },
  "5503A": { key: createRandomId() as RoomId },
  "5503B": { key: createRandomId() as RoomId },
  "2801": { key: createRandomId() as RoomId },
  "2704": { key: createRandomId() as RoomId },
  体育館: { key: createRandomId() as RoomId },
  "2804": { key: createRandomId() as RoomId },
  "2501": { key: createRandomId() as RoomId },
  "2503": { key: createRandomId() as RoomId },
  "2505": { key: createRandomId() as RoomId },
  "5304": { key: createRandomId() as RoomId },
  "4203": { key: createRandomId() as RoomId },
  "2903": { key: createRandomId() as RoomId },
  "2805": { key: createRandomId() as RoomId },
  "5302": { key: createRandomId() as RoomId },
  "2702": { key: createRandomId() as RoomId },
  "5303": { key: createRandomId() as RoomId },
  "2901": { key: createRandomId() as RoomId },
  "21003": { key: createRandomId() as RoomId },
  "21004": { key: createRandomId() as RoomId },
  "2705": { key: createRandomId() as RoomId },
  "2803": { key: createRandomId() as RoomId },
  "1413": { key: createRandomId() as RoomId },
  "1412": { key: createRandomId() as RoomId },
  "2602": { key: createRandomId() as RoomId },
  "2604": { key: createRandomId() as RoomId },
  "5501": { key: createRandomId() as RoomId },
  "5401": { key: createRandomId() as RoomId },
  "5403": { key: createRandomId() as RoomId },
  "2504": { key: createRandomId() as RoomId },
  "2802B": { key: createRandomId() as RoomId },
  "2401": { key: createRandomId() as RoomId },
  "2904": { key: createRandomId() as RoomId },
  "2905": { key: createRandomId() as RoomId },
  "2408": { key: createRandomId() as RoomId },
  "21005": { key: createRandomId() as RoomId },
  "4205": { key: createRandomId() as RoomId },
  "4209": { key: createRandomId() as RoomId },
  "4707": { key: createRandomId() as RoomId },
  "1227": { key: createRandomId() as RoomId },
  "11310": { key: createRandomId() as RoomId },
  "1909": { key: createRandomId() as RoomId },
  "2407": { key: createRandomId() as RoomId },
  "1411": { key: createRandomId() as RoomId },
  "4304": { key: createRandomId() as RoomId },
  "2403": { key: createRandomId() as RoomId },
  "4901A": { key: createRandomId() as RoomId },
  "4302": { key: createRandomId() as RoomId },
  "2404": { key: createRandomId() as RoomId }
} as const;

const classDataList: Array<ClassData> = [
  {
    name: "自然科学概論A（剛体と熱の物理）",
    teacher: "森田 敬吾",
    room: roomList["2603"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "自然科学概論A（剛体と熱の物理）",
    teacher: "中西 剛司",
    room: roomList["2601"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "自然科学概論B（波と電気の物理）",
    teacher: "松田 七美男",
    room: roomList["2605"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "自然科学概論C（情報と科学）",
    teacher: "竜田 藤男",
    room: roomList["21001"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "自然科学概論D（バイオテクノロジー）",
    teacher: "中松 亘",
    room: roomList["2701"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "自然科学概論F（デザインと科学）",
    teacher: "朝川 剛",
    room: roomList["丹羽ホール"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "木村 憲",
    room: roomList["2703"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "総合英語Ⅱ（2年生以上）",
    teacher: "櫻井 拓也",
    room: roomList["1225"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "口語英語Ⅱ（2年生以上）",
    teacher: "ポール ナダスティ",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "総合英語Ⅳ（3年生以上）",
    teacher: "中條 純子",
    room: roomList["2502"].key,
    weekAndTime: { time: "class1", week: "monday" }
  },
  {
    name: "コンピュータ音楽制作演習",
    teacher: "小坂 直敏",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "文章表現法",
    teacher: "本郷 均",
    room: roomList["5503A"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "文章表現法",
    teacher: "河合 孝昭",
    room: roomList["5503B"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "自己心理学セミナー",
    teacher: "金築 智美",
    room: roomList["2801"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "自己心理学セミナー",
    teacher: "矢澤 美香子",
    room: roomList["2704"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "健康と生活",
    teacher: "加藤 知己",
    room: roomList["2701"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "木村 憲",
    room: roomList["体育館"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "哲学と倫理の基礎",
    teacher: "野内 聡",
    room: roomList["2804"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "歴史理解の基礎",
    teacher: "鈴木 邦夫",
    room: roomList["2501"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "実用法律入門",
    teacher: "瀬松 瑞生",
    room: roomList["2703"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "日本経済入門",
    teacher: "阿部 一知",
    room: roomList["2603"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "企業と経営",
    teacher: "世良 耕一",
    room: roomList["2503"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "技術者倫理",
    teacher: "寿楽 浩太",
    room: roomList["2605"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "科学技術と現代社会",
    teacher: "田中 浩朗",
    room: roomList["2505"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "ドイツ語・ドイツ文化",
    teacher: "渡邊 善和",
    room: roomList["5304"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "総合英語Ⅱ（2年生以上）",
    teacher: "相澤 一美",
    room: roomList["4203"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "口語英語Ⅱ（2年生以上）",
    teacher: "ガルシア トラビス ダニエル",
    room: roomList["1225"].key,
    weekAndTime: { time: "class2", week: "monday" }
  },
  {
    name: "データベース",
    teacher: "増田 英孝",
    room: roomList["2903"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "國分 雅敏",
    room: roomList["2605"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "梶ヶ谷 徹",
    room: roomList["2805"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "中島 幸喜",
    room: roomList["2603"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "佐藤 正寿",
    room: roomList["5302"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "千田 雅隆",
    room: roomList["2702"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "古賀 寛尚",
    room: roomList["5303"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア情報学",
    teacher: "矢島 敬士",
    room: roomList["2901"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア演習Ａ（動画）（後前期）",
    teacher: "髙橋 時市郎",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア演習Ａ（動画）（後後期）",
    teacher: "髙橋 時市郎",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア演習Ｂ（音楽）（後前期）",
    teacher: "小坂 直敏",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア演習Ｂ（音楽）（後後期）",
    teacher: "小坂 直敏",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア演習Ｃ（ＣＧ）（後前期）",
    teacher: "森谷 友昭",
    room: roomList["21003"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア演習Ｃ（ＣＧ）（後後期）",
    teacher: "森谷 友昭",
    room: roomList["21003"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア演習Ｄ（画像）（後前期）",
    teacher: "鉄谷 信二",
    room: roomList["21004"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "メディア演習Ｄ（画像）（後後期）",
    teacher: "鉄谷 信二",
    room: roomList["21004"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "木村 憲",
    room: roomList["2703"].key,
    weekAndTime: { time: "class3", week: "monday" }
  },
  {
    name: "データ解析",
    teacher: "井ノ上 寛人",
    room: roomList["2701"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "確率・統計Ⅱ",
    teacher: "宮崎 桂",
    room: roomList["2505"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "深澤 侃子",
    room: roomList["2702"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "西村 滋人",
    room: roomList["2704"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "山本 現",
    room: roomList["2601"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "中島 幸喜",
    room: roomList["2603"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "メディア演習Ａ（動画）（後前期）",
    teacher: "髙橋 時市郎",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "メディア演習Ａ（動画）（後後期）",
    teacher: "髙橋 時市郎",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "メディア演習Ｂ（音楽）（後前期）",
    teacher: "小坂 直敏",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "メディア演習Ｂ（音楽）（後後期）",
    teacher: "小坂 直敏",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "メディア演習Ｃ（ＣＧ）（後前期）",
    teacher: "森谷 友昭",
    room: roomList["21003"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "メディア演習Ｃ（ＣＧ）（後後期）",
    teacher: "森谷 友昭",
    room: roomList["21003"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "メディア演習Ｄ（画像）（後前期）",
    teacher: "鉄谷 信二",
    room: roomList["21004"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "メディア演習Ｄ（画像）（後後期）",
    teacher: "鉄谷 信二",
    room: roomList["21004"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "木村 憲",
    room: roomList["体育館"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "日本語中級ⅡＣ",
    teacher: "相澤 一美",
    room: roomList["4203"].key,
    weekAndTime: { time: "class4", week: "monday" }
  },
  {
    name: "線形代数学Ⅰ（再）",
    teacher: "長町 一平",
    room: roomList["2701"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "線形代数学Ⅰ（再）",
    teacher: "古賀 寛尚",
    room: roomList["2704"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "代数学入門",
    teacher: "原 隆",
    room: roomList["2705"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "近藤 通郎",
    room: roomList["2803"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "植木 潤",
    room: roomList["2804"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "國分 雅敏",
    room: roomList["21003"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "宮谷 和尭",
    room: roomList["21001"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "複素解析学Ⅱ",
    teacher: "梶ヶ谷 徹",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "日本語上級Ⅱ",
    teacher: "山方 純子",
    room: roomList["1413"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "日本事情Ａ（2017年度以降入学者対象）",
    teacher: "塩谷 奈緒子",
    room: roomList["1412"].key,
    weekAndTime: { time: "class5", week: "monday" }
  },
  {
    name: "数値解析学",
    teacher: "池田 京司",
    room: roomList["2602"].key,
    weekAndTime: { time: "class1", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "見正 秀彦",
    room: roomList["2603"].key,
    weekAndTime: { time: "class1", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "植木 潤",
    room: roomList["2604"].key,
    weekAndTime: { time: "class1", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "多田 秀樹",
    room: roomList["2605"].key,
    weekAndTime: { time: "class1", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "原田 新也",
    room: roomList["2701"].key,
    weekAndTime: { time: "class1", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "宮谷 和尭",
    room: roomList["2703"].key,
    weekAndTime: { time: "class1", week: "tuesday" }
  },
  {
    name: "離散数学（基礎情報数学Ａ）",
    teacher: "藤澤 太郎",
    room: roomList["2601"].key,
    weekAndTime: { time: "class1", week: "tuesday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "加藤 知己",
    room: roomList["2505"].key,
    weekAndTime: { time: "class1", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "見正 秀彦",
    room: roomList["2603"].key,
    weekAndTime: { time: "class2", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "多田 秀樹",
    room: roomList["2605"].key,
    weekAndTime: { time: "class2", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "近藤 通郎",
    room: roomList["2604"].key,
    weekAndTime: { time: "class2", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "宮谷 和尭",
    room: roomList["2703"].key,
    weekAndTime: { time: "class2", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "古賀 寛尚",
    room: roomList["2602"].key,
    weekAndTime: { time: "class2", week: "tuesday" }
  },
  {
    name: "センサネットワークと組み込み技術",
    teacher: "岩井 将行",
    room: roomList["2505"].key,
    weekAndTime: { time: "class2", week: "tuesday" }
  },
  {
    name: "データ記述とＷｅｂサービス",
    teacher: "山田 剛一",
    room: roomList["2903"].key,
    weekAndTime: { time: "class2", week: "tuesday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "加藤 知己",
    room: roomList["体育館"].key,
    weekAndTime: { time: "class2", week: "tuesday" }
  },
  {
    name: "サーバプログラミング演習",
    teacher: "廣田 悠輔",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "宮谷 和尭",
    room: roomList["5501"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "國分 雅敏",
    room: roomList["5303"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "中島 幸喜",
    room: roomList["5401"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "新井 啓介",
    room: roomList["2604"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "宮崎 桂",
    room: roomList["2603"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "藤澤 太郎",
    room: roomList["2701"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "千田 雅隆",
    room: roomList["2703"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "植木 潤",
    room: roomList["2804"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "画像処理および演習",
    teacher: "中島 克人",
    room: roomList["21004"].key,
    weekAndTime: { time: "class3", week: "tuesday" }
  },
  {
    name: "サーバプログラミング演習",
    teacher: "廣田 悠輔",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "池田 京司",
    room: roomList["2601"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "梶ヶ谷 徹",
    room: roomList["2803"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "赤堀 庸子",
    room: roomList["2804"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "井川 明",
    room: roomList["2705"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "新井 啓介",
    room: roomList["2604"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "近藤 通郎",
    room: roomList["5403"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "太田 琢也",
    room: roomList["5501"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "見正 秀彦",
    room: roomList["5503B"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "画像処理および演習",
    teacher: "中島 克人",
    room: roomList["21004"].key,
    weekAndTime: { time: "class4", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅰ（再）",
    teacher: "梶ヶ谷 徹",
    room: roomList["2803"].key,
    weekAndTime: { time: "class5", week: "tuesday" }
  },
  {
    name: "線形代数学Ⅰ（再）",
    teacher: "古賀 寛尚",
    room: roomList["2603"].key,
    weekAndTime: { time: "class5", week: "tuesday" }
  },
  {
    name: "代数学",
    teacher: "中島 幸喜",
    room: roomList["5304"].key,
    weekAndTime: { time: "class5", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "原田 新也",
    room: roomList["2501"].key,
    weekAndTime: { time: "class5", week: "tuesday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "千田 雅隆",
    room: roomList["2504"].key,
    weekAndTime: { time: "class5", week: "tuesday" }
  },
  {
    name: "日本語中級ⅡＢ",
    teacher: "塩谷 奈緒子",
    room: roomList["1412"].key,
    weekAndTime: { time: "class5", week: "tuesday" }
  },
  {
    name: "情報技術基礎および演習",
    teacher: "矢島 敬士",
    room: roomList["2901"].key,
    weekAndTime: { time: "class1", week: "wednesday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "石原 美彦",
    room: roomList["2505"].key,
    weekAndTime: { time: "class1", week: "wednesday" }
  },
  {
    name: "英語演習D（2016年度以前入学生対象）",
    teacher: "吹野 佐枝子",
    room: roomList["2502"].key,
    weekAndTime: { time: "class1", week: "wednesday" }
  },
  {
    name: "英語演習D（2016年度以前入学生対象）",
    teacher: "テスター ジェームズ",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class1", week: "wednesday" }
  },
  {
    name: "英語演習F（2017年度以降入学生対象）",
    teacher: "吹野 佐枝子",
    room: roomList["2502"].key,
    weekAndTime: { time: "class1", week: "wednesday" }
  },
  {
    name: "英語演習G（2017年度以降入学生対象）",
    teacher: "テスター ジェームズ",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class1", week: "wednesday" }
  },
  {
    name: "オートマトンと言語理論",
    teacher: "大野 誠寛",
    room: roomList["21003"].key,
    weekAndTime: { time: "class2", week: "wednesday" }
  },
  {
    name: "クラウドコンピューティング",
    teacher: "寺田 真敏",
    room: roomList["2901"].key,
    weekAndTime: { time: "class2", week: "wednesday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "石原 美彦",
    room: roomList["体育館"].key,
    weekAndTime: { time: "class2", week: "wednesday" }
  },
  {
    name: "総合英語Ⅳ（3年生以上）",
    teacher: "三ツ石 直人",
    room: roomList["2802B"].key,
    weekAndTime: { time: "class2", week: "wednesday" }
  },
  {
    name: "英語演習D（2016年度以前入学生対象）",
    teacher: "吹野 佐枝子",
    room: roomList["2502"].key,
    weekAndTime: { time: "class2", week: "wednesday" }
  },
  {
    name: "英語演習D（2016年度以前入学生対象）",
    teacher: "テスター ジェームズ",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class2", week: "wednesday" }
  },
  {
    name: "英語演習F（2017年度以降入学生対象）",
    teacher: "吹野 佐枝子",
    room: roomList["2502"].key,
    weekAndTime: { time: "class2", week: "wednesday" }
  },
  {
    name: "英語演習G（2017年度以降入学生対象）",
    teacher: "テスター ジェームズ",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class2", week: "wednesday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "古賀 初",
    room: roomList["2505"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "グローバル社会の市民論",
    teacher: "広石 英記",
    room: roomList["2801"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "認知心理学",
    teacher: "黒沢 学",
    room: roomList["2401"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "人間関係の心理",
    teacher: "金築 智美",
    room: roomList["2601"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "論理的思考法",
    teacher: "森田 茂行",
    room: roomList["2703"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "日本国憲法",
    teacher: "瀬松 瑞生",
    room: roomList["2903"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "芸術",
    teacher: "田村 義也",
    room: roomList["2504"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "比較文化論",
    teacher: "鈴木 邦夫",
    room: roomList["21003"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "技術者倫理",
    teacher: "藤田 康元",
    room: roomList["2704"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "情報化社会とコミュニケーション",
    teacher: "本郷 均",
    room: roomList["2605"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "情報とネットワークの経済社会",
    teacher: "阿部 一知",
    room: roomList["2604"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "失敗学",
    teacher: "寿楽 浩太",
    room: roomList["2501"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "企業と社会",
    teacher: "世良 耕一",
    room: roomList["2503"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "情報デザインと心理",
    teacher: "今野 紀子",
    room: roomList["5304"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "体力科学演習",
    teacher: "木村 憲",
    room: roomList["2805"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "ドイツ語・ドイツ文化",
    teacher: "渡邊 善和",
    room: roomList["2702"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "中国語・中国文化",
    teacher: "渋谷 由紀",
    room: roomList["2602"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "科学と技術の社会史",
    teacher: "田中 浩朗",
    room: roomList["2904"].key,
    weekAndTime: { time: "class3", week: "wednesday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "古賀 初",
    room: roomList["体育館"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "哲学と倫理の基礎",
    teacher: "横澤 義夫",
    room: roomList["2701"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "論理的思考法",
    teacher: "森田 茂行",
    room: roomList["2703"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "国際政治の基礎",
    teacher: "飯村 友紀",
    room: roomList["2705"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "芸術",
    teacher: "田村 義也",
    room: roomList["2504"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "技術者倫理",
    teacher: "藤田 康元",
    room: roomList["2704"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "地球環境論",
    teacher: "西谷内 博美",
    room: roomList["2904"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "情報と職業",
    teacher: "梅田 政勝",
    room: roomList["2905"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "情報倫理",
    teacher: "曾田 和弘",
    room: roomList["2505"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "情報化社会と知的財産権",
    teacher: "須田 浩史",
    room: roomList["2501"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "中国語・中国文化",
    teacher: "渋谷 由紀",
    room: roomList["2602"].key,
    weekAndTime: { time: "class4", week: "wednesday" }
  },
  {
    name: "オペレーティングシステム（H29年度以降入学者用）",
    teacher: "岩井 将行",
    room: roomList["2903"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "山本 現",
    room: roomList["2601"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "戸野 恵太",
    room: roomList["2603"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "原田 新也",
    room: roomList["2701"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "藤澤 太郎",
    room: roomList["2704"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "古賀 初",
    room: roomList["2505"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "英語演習D（2016年以前入学者対象）",
    teacher: "竹田 らら",
    room: roomList["4203"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "英語演習D（2016年以前入学者対象）",
    teacher: "高橋 実知子",
    room: roomList["2501"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "英語演習F（2017年以降入学者対象）",
    teacher: "竹田 らら",
    room: roomList["4203"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "英語演習G（2017年以降入学者対象）",
    teacher: "高橋 実知子",
    room: roomList["2501"].key,
    weekAndTime: { time: "class1", week: "thursday" }
  },
  {
    name: "ソフトウェア設計",
    teacher: "増田 英孝",
    room: roomList["2901"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "データ構造とアルゴリズム",
    teacher: "大野 誠寛",
    room: roomList["2903"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "藤澤 太郎",
    room: roomList["2704"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "宮谷 和尭",
    room: roomList["2601"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "佐藤 正寿",
    room: roomList["2504"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "植木 潤",
    room: roomList["2705"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "戸野 恵太",
    room: roomList["2603"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "線形代数学Ⅱ",
    teacher: "原田 新也",
    room: roomList["2701"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "インタラクション・インタフェース基礎",
    teacher: "川澄 正史",
    room: roomList["2503"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "古賀 初",
    room: roomList["体育館"].key,
    weekAndTime: { time: "class2", week: "thursday" }
  },
  {
    name: "コンピュータプログラミングⅡ",
    teacher: "中島 克人",
    room: roomList["2408"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "コンピュータプログラミングⅡ",
    teacher: "山田 剛一",
    room: roomList["21001"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "コンピュータプログラミングⅡ",
    teacher: "井ノ上 寛人",
    room: roomList["21005"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "深澤 侃子",
    room: roomList["2702"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "西村 滋人",
    room: roomList["2704"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "山本 現",
    room: roomList["2601"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "中島 幸善",
    room: roomList["2603"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "データ構造とアルゴリズム演習",
    teacher: "大野 誠寛",
    room: roomList["21004"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "CGレンダリングおよび演習",
    teacher: "髙橋 時市郎",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "thursday" }
  },
  {
    name: "GUIプログラミング",
    teacher: "増田 英孝",
    room: roomList["21004"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "コンピュータプログラミングⅡ",
    teacher: "中島 克人",
    room: roomList["2408"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "コンピュータプログラミングⅡ",
    teacher: "山田 剛一",
    room: roomList["21001"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "コンピュータプログラミングⅡ",
    teacher: "井ノ上 寛人",
    room: roomList["21005"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "國分 雅敏",
    room: roomList["2605"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "梶ヶ谷 徹",
    room: roomList["2805"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "中島 幸善",
    room: roomList["2603"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "佐藤 正寿",
    room: roomList["5302"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "千田 雅隆",
    room: roomList["2702"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "古賀 寛尚",
    room: roomList["5303"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "CGレンダリングおよび演習",
    teacher: "髙橋 時市郎",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "ネットワークセキュリティおよび演習（2017年度以降の入学者用）",
    teacher: "寺田 真敏",
    room: roomList["2901"].key,
    weekAndTime: { time: "class4", week: "thursday" }
  },
  {
    name: "線形代数学Ⅰ（再）",
    teacher: "見正 秀彦",
    room: roomList["2501"].key,
    weekAndTime: { time: "class5", week: "thursday" }
  },
  {
    name: "線形代数学Ⅰ（再）",
    teacher: "古賀 寛尚",
    room: roomList["5303"].key,
    weekAndTime: { time: "class5", week: "thursday" }
  },
  {
    name: "微分幾何学",
    teacher: "佐藤 正寿",
    room: roomList["5302"].key,
    weekAndTime: { time: "class5", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "國分 雅敏",
    room: roomList["21003"].key,
    weekAndTime: { time: "class5", week: "thursday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "宮谷 和尭",
    room: roomList["21001"].key,
    weekAndTime: { time: "class5", week: "thursday" }
  },
  {
    name: "日本語中級ⅡA",
    teacher: "山方 純子",
    room: roomList["1412"].key,
    weekAndTime: { time: "class5", week: "thursday" }
  },
  {
    name: "物理実験（FI・FR）",
    teacher: "中西 剛司",
    room: roomList["4205"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "自然科学概論A（剛体と熱の物理）",
    teacher: "長澤 光晴",
    room: roomList["2804"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "自然科学概論B（波と電気の物理）",
    teacher: "坂本 昇一",
    room: roomList["2904"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "自然科学概論B（波と電気の物理）",
    teacher: "丹羽 雅昭",
    room: roomList["2803"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "自然科学概論D（バイオテクノロジー）",
    teacher: "鈴木 榮一郎",
    room: roomList["2703"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "自然科学概論E（物質と材料の化学）",
    teacher: "保倉 明子",
    room: roomList["2705"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "化学・生物実験（FA・FI・FR）",
    teacher: "田中 里美",
    room: roomList["4209"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "大学と社会",
    teacher: "大江 正比古",
    room: roomList["2601"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "芸術",
    teacher: "本郷 均",
    room: roomList["5501"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "介護福祉論",
    teacher: "加藤 英池子",
    room: roomList["4707"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "アメリカ理解",
    teacher: "川邉 孝",
    room: roomList["2701"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "ヨーロッパ理解",
    teacher: "渡邉 善和",
    room: roomList["2604"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "アジア理解",
    teacher: "阿部 一知",
    room: roomList["2805"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "比較文化論",
    teacher: "鈴木 邦夫",
    room: roomList["2503"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "技術者倫理",
    teacher: "寿楽 浩太",
    room: roomList["2501"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "製造物責任法",
    teacher: "頼松 瑞生",
    room: roomList["2603"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "科学技術と企業経営",
    teacher: "世良 耕一",
    room: roomList["2504"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "科学技術と現代社会",
    teacher: "田中 浩朗",
    room: roomList["2905"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "身体運動のしくみ",
    teacher: "木村 憲",
    room: roomList["2505"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "中国語・中国文化",
    teacher: "渋谷 由紀",
    room: roomList["2702"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "総合英語Ⅱ（2年生以上）",
    teacher: "三ツ石 直人",
    room: roomList["1225"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "口語英語Ⅱ（2年生以上）",
    teacher: "アダム クリストファー",
    room: roomList["1227"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "総合英語Ⅳ（3年生以上）",
    teacher: "磯 達夫",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "総合英語Ⅳ（3年生以上）",
    teacher: "伊藤 由起子",
    room: roomList["2802B"].key,
    weekAndTime: { time: "class1", week: "friday" }
  },
  {
    name: "物理実験（FI・FR）",
    teacher: "中西 剛司",
    room: roomList["4205"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "自然科学概論C（情報と科学）",
    teacher: "竜田 藤男",
    room: roomList["5304"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "生体情報とVR",
    teacher: "川澄 正史",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "化学・生物実験（FA・FI・FR）",
    teacher: "田中 里美",
    room: roomList["4209"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "文章表現法",
    teacher: "河合 孝昭",
    room: roomList["5503B"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "文章表現法",
    teacher: "本郷 均",
    room: roomList["5503A"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "自己心理学セミナー",
    teacher: "前田 綾子",
    room: roomList["2601"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "自己心理学セミナー",
    teacher: "高橋 恵理子",
    room: roomList["2803"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "健康と生活",
    teacher: "加藤 知己",
    room: roomList["2804"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "哲学と倫理の基礎",
    teacher: "野内 聡",
    room: roomList["2904"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "歴史理解の基礎",
    teacher: "鈴木 邦夫",
    room: roomList["2504"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "実用法律入門",
    teacher: "頼松 瑞生",
    room: roomList["2603"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "日本経済入門",
    teacher: "阿部 一知",
    room: roomList["2805"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "企業と経営",
    teacher: "世良 耕一",
    room: roomList["2503"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "失敗学",
    teacher: "寿楽 浩太",
    room: roomList["2501"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "ドイツ語・ドイツ文化",
    teacher: "渡邉 善和",
    room: roomList["2604"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "ドイツ語・ドイツ文化",
    teacher: "小川 和彦",
    room: roomList["4707"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "科学と技術の社会史",
    teacher: "田中 浩朗",
    room: roomList["2905"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "総合英語Ⅱ（2年生以上）",
    teacher: "桑原 洋",
    room: roomList["1225"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "口語英語Ⅱ（2年生以上）",
    teacher: "ダレン マイケル ヴァン ヴィーレン",
    room: roomList["2802B"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "英語演習D（2016年以前入学生対象）",
    teacher: "ガルシア トラビス ダニエル",
    room: roomList["1227"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "英語演習D（2016年以前入学生対象）",
    teacher: "西口 昌宏",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "英語演習F（2017年以降入学生対象）",
    teacher: "西口 昌宏",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "英語演習G（2017年以降入学生対象）",
    teacher: "ガルシア トラビス ダニエル",
    room: roomList["1227"].key,
    weekAndTime: { time: "class2", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "池田 京司",
    room: roomList["2601"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "梶ヶ谷 徹",
    room: roomList["2803"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "赤堀 庸子",
    room: roomList["2804"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "井川 明",
    room: roomList["2705"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "新井 啓介",
    room: roomList["2604"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "近藤 通朗",
    room: roomList["5403"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "太田 琢也",
    room: roomList["5501"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "見正 秀彦",
    room: roomList["5503B"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "中島 克人",
    room: roomList["11310"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "増田 英孝",
    room: roomList["2408"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "川澄 正史",
    room: roomList["1909"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "小坂 直敏",
    room: roomList["2407"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "廣田 悠輔",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "岩井 将行",
    room: roomList["1411"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "鉄谷 信二",
    room: roomList["4304"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "矢島 敬士",
    room: roomList["2403"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "高橋 時市郎",
    room: roomList["2401"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "井ノ上 寛人",
    room: roomList["4304"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "竜田 藤男",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "山田 剛一",
    room: roomList["2408"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "寺田 真敏",
    room: roomList["1413"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "森谷 友昭",
    room: roomList["2401"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "大野 誠寛",
    room: roomList["FI科演習室"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "池田 雄介",
    room: roomList["1412"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "広石 英記",
    room: roomList["4901A"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "情報メディア応用ゼミ",
    teacher: "世良 耕一",
    room: roomList["2904"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "古賀 初",
    room: roomList["2505"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習A（2017年以降入学生対象）",
    teacher: "テスター ジェームズ",
    room: roomList["4302"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習A（2017年以降入学生対象）",
    teacher: "アダム クリストファー",
    room: roomList["2704"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習B（2016年以前入学生対象）",
    teacher: "テスター ジェームズ",
    room: roomList["4302"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習B（2017年以降入学生対象）",
    teacher: "桑原 洋",
    room: roomList["2602"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習B（2016年以前入学生対象）",
    teacher: "桑原 洋",
    room: roomList["2602"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習B（2016年以前入学生対象）",
    teacher: "西口 昌宏",
    room: roomList["2802B"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習B（2016年以前入学生対象）",
    teacher: "竹田 らら",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習B（2016年以前入学生対象）",
    teacher: "鈴木 光代",
    room: roomList["2404"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習B（2016年以前入学生対象）",
    teacher: "アダム クリストファー",
    room: roomList["2704"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習C（2017年以降入学生対象）",
    teacher: "西口 昌宏",
    room: roomList["2802B"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習D（2017年以降入学生対象）",
    teacher: "竹田 らら",
    room: roomList["2802A"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "英語演習E（2017年以降入学生対象）",
    teacher: "鈴木 光代",
    room: roomList["2404"].key,
    weekAndTime: { time: "class3", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "新井 啓介",
    room: roomList["2604"].key,
    weekAndTime: { time: "class4", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "宮崎 桂",
    room: roomList["2603"].key,
    weekAndTime: { time: "class4", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "藤澤 太郎",
    room: roomList["2701"].key,
    weekAndTime: { time: "class4", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "千田 雅隆",
    room: roomList["2703"].key,
    weekAndTime: { time: "class4", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅱ",
    teacher: "植木 潤",
    room: roomList["2804"].key,
    weekAndTime: { time: "class4", week: "friday" }
  },
  {
    name: "トリムスポーツⅡ",
    teacher: "古賀 初",
    room: roomList["体育館"].key,
    weekAndTime: { time: "class4", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "近藤 通朗",
    room: roomList["2803"].key,
    weekAndTime: { time: "class5", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "植木 潤",
    room: roomList["2804"].key,
    weekAndTime: { time: "class5", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "原田 新也",
    room: roomList["2701"].key,
    weekAndTime: { time: "class5", week: "friday" }
  },
  {
    name: "微分積分学および演習Ⅰ（再）",
    teacher: "千田 雅隆",
    room: roomList["2504"].key,
    weekAndTime: { time: "class5", week: "friday" }
  },
  {
    name: "基礎物理学B（再）",
    teacher: "中西 剛司",
    room: roomList["4304"].key,
    weekAndTime: { time: "class5", week: "friday" }
  },
  {
    name: "微分方程式Ⅱ",
    teacher: "八尋 耕平",
    room: roomList["21004"].key,
    weekAndTime: { time: "class3", week: "saturday" }
  },
  {
    name: "工業技術概論",
    teacher: "豊田 善敬",
    room: roomList["5503A"].key,
    weekAndTime: { time: "class3", week: "saturday" }
  }
];

/*
 * ^([^\t]+)\t*([^\t]+)\t*([^\t\n]+)\n?\t* {name: "$1", teacher: "$2", location: locationList["$3"].key, weekAndTime: {time: "class1", week: "monday"}},
 */

export const setClassAndLocationData = async (): Promise<void> => {
  const writeBatch = database.batch();
  for (const classData of classDataList) {
    writeBatch.create(
      database.collection("class").doc(createRandomId() as ClassId),
      classData
    );
  }
  for (const [roomName, roomKey] of Object.entries(roomList)) {
    writeBatch.create(database.collection("room").doc(roomKey.key), {
      name: roomName
    });
  }
  await writeBatch.commit();
};
