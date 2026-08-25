"""
将所有党支部 xlsx 文件转换为网页应用可用的 JSON 数据
数据结构对齐 store.js 的 state 结构
"""
import os
import json
import re
import random
import string
import openpyxl

XLSX_DIR = r'c:\Users\86135\Desktop\汤原镇'
OUTPUT = r'c:\Users\86135\Desktop\汤原镇\web-app\initial-data.js'


def gen_id():
    """生成唯一ID（模拟前端ID格式）"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))


def normalize_date(raw):
    """统一日期格式为 YYYY-MM-DD"""
    if raw is None:
        return ''
    s = str(raw).strip()
    if not s:
        return ''
    # 处理 2026.01.17 / 2026.1.7
    m = re.match(r'^(\d{4})\.(\d{1,2})\.(\d{1,2})$', s)
    if m:
        y, mo, d = m.groups()
        return f'{y}-{int(mo):02d}-{int(d):02d}'
    # 处理 2026.01 (只有年月)
    m = re.match(r'^(\d{4})\.(\d{1,2})$', s)
    if m:
        y, mo = m.groups()
        return f'{y}-{int(mo):02d}'
    # 处理 1998-05-01
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m:
        y, mo, d = m.groups()
        return f'{y}-{int(mo):02d}-{int(d):02d}'
    # 处理 datetime 对象
    if hasattr(raw, 'strftime'):
        try:
            return raw.strftime('%Y-%m-%d')
        except Exception:
            return ''
    # 处理浮点数日期如 2017.08
    if isinstance(raw, float):
        s = str(raw)
        if '.' in s:
            y, mo = s.split('.')
            try:
                return f'{int(y):04d}-{int(float("0." + mo) * 100):02d}'
            except Exception:
                pass
    return s


def normalize_duration(raw):
    """统一培训时长为字符串"""
    if raw is None:
        return ''
    if isinstance(raw, (int, float)):
        # 整数显示为整数，小数保留
        if float(raw).is_integer():
            return f'{int(raw)}学时'
        return f'{raw}学时'
    s = str(raw).strip()
    if not s:
        return ''
    if s.startswith('='):
        return ''  # 跳过公式
    return s + '学时' if not s.endswith('学时') and not s.endswith('小时') else s


def parse_xlsx(filepath, branch_id):
    """解析单个 xlsx 文件，返回 members 和 records"""
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active
    members = []
    records = []
    current_member = None
    member_id_map = {}  # 姓名 -> member_id，用于去重

    for row in ws.iter_rows(min_row=4, values_only=True):
        if not row or len(row) < 6:
            continue
        idx, name, join_date, train_date, content, duration = row[:6]

        # 跳过完全空白的行
        if all(c is None or str(c).strip() == '' for c in row[:6]):
            continue
        # 跳过合计行
        if idx is None and name is None and train_date is None and content is None:
            continue
        if isinstance(name, str) and ('合计' in name or '总计' in name or '平均' in name):
            continue

        # 新党员：序号或姓名有值
        if (idx is not None and str(idx).strip() not in ('', '0')) or \
           (name is not None and str(name).strip() not in ''):
            name_str = str(name).strip() if name else ''
            if not name_str:
                continue
            # 同名党员复用ID（同支部内同名视为同一人）
            if name_str in member_id_map:
                current_member = member_id_map[name_str]
            else:
                mid = gen_id()
                members.append({
                    'id': mid,
                    'name': name_str,
                    'branchId': branch_id,
                    'joinDate': normalize_date(join_date),
                    'createdAt': '2026-08-12T00:00:00.000Z'
                })
                member_id_map[name_str] = mid
                current_member = mid

        # 培训记录：必须有培训时间和内容
        if current_member and train_date is not None and content is not None:
            td = str(train_date).strip()
            ct = str(content).strip()
            if td and ct and not td.startswith('='):
                records.append({
                    'id': gen_id(),
                    'memberId': current_member,
                    'branchId': branch_id,
                    'trainingDate': normalize_date(train_date),
                    'methodAndContent': ct,
                    'duration': normalize_duration(duration),
                    'createdAt': '2026-08-12T00:00:00.000Z'
                })

    return members, records


def main():
    all_branches = []
    all_members = []
    all_records = []

    xlsx_files = sorted([f for f in os.listdir(XLSX_DIR)
                         if f.endswith('.xlsx') and not f.startswith('~$') and not f.startswith('Sheet')])
    print(f'找到 {len(xlsx_files)} 个党支部文件')

    for fname in xlsx_files:
        branch_name = os.path.splitext(fname)[0]
        branch_id = gen_id()
        filepath = os.path.join(XLSX_DIR, fname)
        try:
            members, records = parse_xlsx(filepath, branch_id)
            all_branches.append({
                'id': branch_id,
                'name': branch_name,
                'createdAt': '2026-08-12T00:00:00.000Z'
            })
            all_members.extend(members)
            all_records.extend(records)
            print(f'  {branch_name}: {len(members)} 人, {len(records)} 条记录')
        except Exception as e:
            print(f'  [错误] {branch_name}: {e}')

    print(f'\n汇总: {len(all_branches)} 个党支部, {len(all_members)} 名党员, {len(all_records)} 条培训记录')

    # 按培训时间升序排序记录
    all_records.sort(key=lambda r: r['trainingDate'])

    # 写成 JS 文件，挂载到 window 上
    data = {
        'branches': all_branches,
        'members': all_members,
        'records': all_records,
        'currentBranchId': all_branches[0]['id'] if all_branches else None
    }

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write('/**\n')
        f.write(' * 初始数据 - 从党支部 xlsx 文件导入生成\n')
        f.write(f' * 党支部: {len(all_branches)} 个 | 党员: {len(all_members)} 名 | 培训记录: {len(all_records)} 条\n')
        f.write(' */\n')
        f.write('window.INITIAL_DATA = ')
        f.write(json.dumps(data, ensure_ascii=False, indent=2))
        f.write(';\n')

    print(f'\n已生成: {OUTPUT}')


if __name__ == '__main__':
    main()
