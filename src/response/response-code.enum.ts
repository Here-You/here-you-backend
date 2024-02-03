import { HttpStatus } from '@nestjs/common';

export enum ResponseCode {

  /* 200 OK : 요청 성공 */
  SIGNIN_SUCCESS = 'OK',
  SIGNOUT_SUCCESS = 'OK',
  REISSUE_TOKEN_SUCCESS = 'OK',
  GET_MY_SIGNATURES_SUCCESS = 'OK',
  GET_SIGNATURE_DETAIL_SUCCESS = 'OK',

  /* 201 CREATED : 요청 성공, 자원 생성 */
  SIGNUP_SUCCESS = 'CREATED',
  SIGNATURE_CREATED = 'CREATED',
  RULE_CREATED = 'CREATED',


  /* 400 BAD_REQUEST : 잘못된 요청 */
  AUTH_NUMBER_INCORRECT = 'BAD_REQUEST',
  RESET_PASSWORD_FAIL_MATCH = 'BAD_REQUEST',
  SIGNATURE_CREATION_FAIL = 'BAD_REQUEST',
  RULE_CREATION_FAIL = 'BAD_REQUEST',


  /* 401 UNAUTHORIZED : 인증되지 않은 사용자 */
  INVALID_AUTH_TOKEN = 'UNAUTHORIZED',
  INVALID_ACCOUNT = 'UNAUTHORIZED',
  UNKNOWN_AUTHENTICATION_ERROR = 'UNAUTHORIZED',


  /* 403 FORBIDDEN : 권한이 없는 사용자 */
  INVALID_REFRESH_TOKEN = 'FORBIDDEN',
  HOLDING_WITHDRAWAL = 'FORBIDDEN',
  SIGNOUT_FAIL_REFRESH_TOKEN = 'FORBIDDEN',


  /* 404 NOT_FOUND : Resource 를 찾을 수 없음 */
  ACCOUNT_NOT_FOUND = 'NOT_FOUND',
  REFRESH_TOKEN_NOT_FOUND = 'NOT_FOUND',
  SIGNATURE_NOT_FOUND = 'NOT_FOUND',


  /* 409 CONFLICT : Resource 의 현재 상태와 충돌. 보통 중복된 데이터 존재 */
  EMAIL_DUPLICATION = 'CONFLICT',
  USERNAME_DUPLICATION = 'CONFLICT',
  NICKNAME_DUPLICATION = 'CONFLICT',


  /* 500 INTERNAL_SERVER_ERROR */
  INTERNAL_SERVEr_ERROR = 'INTERNAL_SERVER_ERROR'
}
