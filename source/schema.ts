import * as g from "graphql";
import Maybe from "graphql/tsutils/Maybe";
import { URL } from "url";
import * as data from "./data";
import * as database from "./database";

export const parseFileHash = (value: unknown): database.FileHash => {
  if (typeof value !== "string") {
    throw new Error("Hash must be string");
  }
  if (value.length !== 64) {
    throw new Error("Hash length must be 64");
  }
  for (const char of value) {
    if (!"0123456789abcdef".includes(char)) {
      throw new Error("Hash char must match /[0-9a-f]/");
    }
  }
  return value as database.FileHash;
};

const fileHashTypeConfig: g.GraphQLScalarTypeConfig<
  database.FileHash,
  string
> = {
  name: "FileHash",
  description:
    "SHA-256で得られたハッシュ値。hexスタイル。16進数でa-fは小文字、64文字 https://asia-northeast1-clavision.cloudfunctions.net/file/{hash} のURLからファイルを得ることができる",
  serialize: (value: database.FileHash): string => value,
  parseValue: parseFileHash
};

const hashGraphQLType = new g.GraphQLScalarType(fileHashTypeConfig);

const makeObjectFieldMap = <Type extends { [k in string]: unknown }>(
  args: Type extends { id: string } | { hash: string }
    ? {
        [Key in keyof Type]: Key extends "id" | "hash"
          ? {
              type: g.GraphQLOutputType;
              description: string;
            }
          : GraphQLFieldConfigWithArgs<Type, Key>;
      }
    : {
        [Key in keyof Type]: {
          type: g.GraphQLOutputType;
          description: string;
        };
      }
): g.GraphQLFieldConfigMap<Type, void, any> => args;

type GraphQLFieldConfigWithArgs<
  Type extends { [k in string]: unknown },
  Key extends keyof Type // この型変数は型推論に使われる
> = {
  type: g.GraphQLOutputType;
  args: any;
  resolve: g.GraphQLFieldResolver<Type, void, any>;
  description: string;
  __byMakeObjectFieldFunctionBrand: never;
};

const makeObjectField = <
  Type extends { [k in string]: unknown },
  Key extends keyof Type,
  T extends { [k in string]: unknown } // for allがあればなぁ
>(data: {
  type: g.GraphQLOutputType;
  args: { [k in keyof T]: { type: g.GraphQLInputType } };
  resolve: (source: Return<Type>, args: T) => Promise<Return<Type[Key]>>;
  description: string;
}): GraphQLFieldConfigWithArgs<Type, Key> =>
  ({
    type: data.type,
    args: data.args,
    resolve: (source, args, context, info) => data.resolve(source as any, args),
    description: data.description
  } as GraphQLFieldConfigWithArgs<Type, Key>);

/** resolveで返すべき部分型を生成する */
type Return<Type> = Type extends Array<infer E>
  ? Array<ReturnLoop<E>>
  : ReturnLoop<Type>;

/** resolveで返すべき部分型を生成する型関数のループ */
type ReturnLoop<Type> = Type extends { id: infer idType }
  ? { id: idType } & { [k in keyof Type]?: Return<Type[k]> }
  : Type extends { hash: infer hashType }
  ? { hash: hashType } & { [k in keyof Type]?: Return<Type[k]> }
  : { [k in keyof Type]: Return<Type[k]> };

const makeQueryOrMutationField = <
  Args extends { [k in string]: unknown },
  Type
>(data: {
  type: g.GraphQLOutputType;
  args: {
    [a in keyof Args]: {
      type: g.GraphQLInputType;
      description: Maybe<string>;
    };
  };
  resolve: (args: Args) => Promise<Return<Type>>;
  description: string;
}): g.GraphQLFieldConfig<void, void, any> => {
  return {
    type: data.type,
    args: data.args,
    resolve: (source, args, context, info) => data.resolve(args),
    description: data.description
  };
};

const graphQLNonNullList = (
  type: g.GraphQLNullableType
): g.GraphQLNonNull<g.GraphQLNullableType> =>
  g.GraphQLNonNull(g.GraphQLList(g.GraphQLNonNull(type)));

const urlTypeScalarTypeConfig: g.GraphQLScalarTypeConfig<URL, string> = {
  name: "URL",
  description: `URL 文字列で指定する 例"https://narumincho.com/definy/spec.html"`,
  serialize: (url: URL): string => url.toString(),
  parseValue: (value: string): URL => new URL(value)
};

const urlGraphQLType = new g.GraphQLScalarType(urlTypeScalarTypeConfig);

/**
 * 新規登録かログインするためのURLを得る
 */
const getLineLoginUrl = makeQueryOrMutationField<{}, URL>({
  type: g.GraphQLNonNull(urlGraphQLType),
  args: {},
  resolve: async args => {
    return data.urlFrom(
      "access.line.me",
      ["oauth2", "v2.1", "authorize"],
      new Map([
        ["response_type", "code"],
        ["client_id", data.lineLoginClientId],
        ["redirect_uri", data.lineLoginRedirectUri],
        ["scope", "profile openid"],
        ["state", await database.generateAndWriteLineLoginState()]
      ]),
      new Map()
    );
  },
  description:
    "新規登録かログインするためのURLを得る。受け取ったURLをlocation.hrefに代入するとかして、各サービスの認証画面へ"
});

const setRoomData = async (
  source: Return<database.RoomData & { id: database.RoomId }>
): Promise<database.RoomData> => {
  const data = await database.getRoomData(source.id);
  source.name = data.name;
  return data;
};

const roomGraphQLObjectType = new g.GraphQLObjectType({
  name: "Room",
  fields: makeObjectFieldMap<database.RoomData & { id: database.RoomId }>({
    id: {
      type: g.GraphQLNonNull(g.GraphQLString),
      description: "教室を識別するためのID"
    },
    name: makeObjectField({
      type: g.GraphQLNonNull(g.GraphQLString),
      args: {},
      resolve: async (source, args): Promise<string> => {
        if (source.name === undefined) {
          return (await setRoomData(source)).name;
        }
        return source.name;
      },
      description: "教室の名前"
    })
  }),
  description: "教室のデータ"
});

const weekGraphQlTypeValues: {
  [key in database.Week]: { description: string };
} = {
  monday: {
    description: "月曜日"
  },
  tuesday: {
    description: "火曜日"
  },
  wednesday: {
    description: "水曜日"
  },
  thursday: {
    description: "木曜日"
  },
  friday: {
    description: "金曜日"
  },
  saturday: {
    description: "土曜日"
  }
};

const weekGraphQLType = new g.GraphQLEnumType({
  name: "Week",
  description: "授業がある月～土までの曜日",
  values: weekGraphQlTypeValues
});

const timeGraphQLTypeValues: {
  [key in database.Time]: { description: string };
} = {
  class1: {
    description: "1時限目"
  },
  class2: {
    description: "2時限目"
  },
  class3: {
    description: "3時限目"
  },
  class4: {
    description: "4時限目"
  },
  class5: {
    description: "5時限目"
  }
};

const timeGraphQLType = new g.GraphQLEnumType({
  name: "Time",
  description: "時限",
  values: timeGraphQLTypeValues
});

const weekAndTimeGraphQLType = new g.GraphQLObjectType({
  name: "WeekAndTime",
  description: "曜日と時限",
  fields: makeObjectFieldMap<database.WeekAndTime>({
    week: {
      type: weekGraphQLType,
      description: "曜日"
    },
    time: {
      type: timeGraphQLType,
      description: "時限"
    }
  })
});

const setClassData = async (
  source: Return<{
    id: database.ClassId;
    name: string;
    teacher: string;
    room: { id: database.RoomId } & database.RoomData;
    weekAndTime: database.WeekAndTime;
  }>
): ReturnType<typeof database.getClassData> => {
  const data = await database.getClassData(source.id);
  source.name = data.name;
  source.teacher = data.teacher;
  source.room = data.room;
  source.weekAndTime = data.weekAndTime;
  return data;
};

const classGraphQLObjectType = new g.GraphQLObjectType({
  name: "Class",
  fields: makeObjectFieldMap<{
    id: database.ClassId;
    name: string;
    teacher: string;
    room: { id: database.RoomId } & database.RoomData;
    weekAndTime: database.WeekAndTime;
  }>({
    id: {
      type: g.GraphQLNonNull(g.GraphQLString),
      description: "授業を識別するためのID"
    },
    name: makeObjectField({
      type: g.GraphQLNonNull(g.GraphQLString),
      args: {},
      resolve: async (source, args): Promise<string> => {
        if (source.name === undefined) {
          return (await setClassData(source)).name;
        }
        return source.name;
      },
      description: "授業名"
    }),
    teacher: makeObjectField({
      type: g.GraphQLNonNull(g.GraphQLString),
      args: {},
      resolve: async (source, args): Promise<string> => {
        if (source.teacher === undefined) {
          return (await setClassData(source)).teacher;
        }
        return source.teacher;
      },
      description: "講師"
    }),
    weekAndTime: makeObjectField({
      type: g.GraphQLNonNull(weekAndTimeGraphQLType),
      args: {},
      resolve: async (source, args): Promise<database.WeekAndTime> => {
        if (source.weekAndTime === undefined) {
          return (await setClassData(source)).weekAndTime;
        }
        return source.weekAndTime;
      },
      description: "曜日と時限"
    }),
    room: makeObjectField({
      type: g.GraphQLNonNull(roomGraphQLObjectType),
      args: {},
      resolve: async (source, args): Promise<{ id: database.RoomId }> => {
        if (source.room === undefined) {
          return (await setClassData(source)).room;
        }
        return source.room;
      },
      description: "教室"
    })
  }),
  description: "授業のデータ"
});

export const schema = new g.GraphQLSchema({
  query: new g.GraphQLObjectType({
    name: "Query",
    description:
      "データを取得できる。データを取得したときに影響は他に及ばさない",
    fields: {
      hello: makeQueryOrMutationField<{}, string>({
        type: g.GraphQLNonNull(g.GraphQLString),
        args: {},
        description: "clavisionにあいさつをする",
        resolve: async () => {
          return "やあ、clavisionのAPIサーバーだよ";
        }
      }),
      roomAll: makeQueryOrMutationField<
        {},
        Array<database.RoomData & { id: database.RoomId }>
      >({
        type: graphQLNonNullList(roomGraphQLObjectType),
        args: {},
        description: "すべての教室のデータ",
        resolve: async () => await database.getAllRoomData()
      }),
      classAll: makeQueryOrMutationField<
        {},
        Array<{
          id: database.ClassId;
          name: string;
          teacher: string;
          room: { id: database.RoomId } & database.RoomData;
          weekAndTime: database.WeekAndTime;
        }>
      >({
        type: graphQLNonNullList(classGraphQLObjectType),
        args: {},
        description: "すべての授業のデータ",
        resolve: async () => await database.getAllClassData()
      })
    }
  }),
  mutation: new g.GraphQLObjectType({
    name: "Mutation",
    description: "データを作成、更新ができる",
    fields: {
      getLineLoginUrl
    }
  })
});
