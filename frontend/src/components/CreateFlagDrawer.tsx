import React, { useState, useEffect } from 'react';
import { Drawer, Form, Input, Select, Switch, Button, Space, Alert, message } from 'antd';
import { CreateFlagPayload, Environment, Flag } from '../types';
import { api, ApiError } from '../api/client';

interface CreateFlagDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (flag: Flag) => void;
  initialEnvironment?: Environment;
}

export const CreateFlagDrawer: React.FC<CreateFlagDrawerProps> = ({
  open,
  onClose,
  onSuccess,
  initialEnvironment = 'development',
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        environment: initialEnvironment,
        default_value: false,
      });
      setErrorMessage(null);
    }
  }, [open, initialEnvironment, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      setErrorMessage(null);

      const payload: CreateFlagPayload = {
        key: values.key.trim(),
        name: values.name.trim(),
        description: values.description ? values.description.trim() : '',
        environment: values.environment,
        default_value: !!values.default_value,
      };

      const created = await api.createFlag(payload);
      message.success(`Feature Flag [${created.key}] 创建成功`);
      onSuccess(created);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'FLAG_KEY_CONFLICT') {
          setErrorMessage(
            `冲突提示：环境【${form.getFieldValue('environment')}】中已存在 Key 为 "${form.getFieldValue('key')}" 的 Flag，同一环境下禁止重复。可在其他环境中创建该 Key。`
          );
        } else {
          setErrorMessage(err.message || '创建 Flag 失败');
        }
      } else if (err && typeof err === 'object' && 'errorFields' in err) {
        // Antd form validation error, automatically highlighted in fields
      } else {
        setErrorMessage('网络或系统异常，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title="新建 Feature Flag"
      width={480}
      open={open}
      onClose={() => !submitting && onClose()}
      maskClosable={!submitting}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="primary" onClick={handleSubmit} loading={submitting}>
            立即创建
          </Button>
        </Space>
      }
    >
      {errorMessage && (
        <Alert
          type="error"
          showIcon
          message={errorMessage}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setErrorMessage(null)}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        disabled={submitting}
        initialValues={{
          environment: initialEnvironment,
          default_value: false,
        }}
      >
        <Form.Item
          name="environment"
          label="运行环境 (Environment)"
          rules={[{ required: true, message: '请选择运行环境' }]}
          tooltip="Flag 在特定环境隔离运行，不同环境允许使用相同的 Key"
        >
          <Select
            options={[
              { label: 'Development (开发环境)', value: 'development' },
              { label: 'Staging (预发环境)', value: 'staging' },
              { label: 'Production (生产环境)', value: 'production' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="key"
          label="Flag Key"
          rules={[
            { required: true, message: '请输入 Flag Key 唯一标识' },
            {
              pattern: /^[a-zA-Z0-9_-]+$/,
              message: 'Flag Key 只能包含字母、数字、下划线及连字符',
            },
            { max: 128, message: 'Flag Key 不能超过 128 个字符' },
          ]}
          tooltip="全局功能标识，代码中调用的唯一 key，同一环境下必须唯一"
        >
          <Input placeholder="例如: driver_trip_summary_enabled" autoFocus />
        </Form.Item>

        <Form.Item
          name="name"
          label="Flag 名称"
          rules={[
            { required: true, message: '请输入 Flag 显示名称' },
            { max: 255, message: '名称不能超过 255 个字符' },
          ]}
        >
          <Input placeholder="例如: 新版结算页灰度开关" />
        </Form.Item>

        <Form.Item name="description" label="描述 (可选)">
          <Input.TextArea
            rows={3}
            placeholder="描述此 Feature Flag 的业务场景及灰度放量目标"
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Form.Item
          name="default_value"
          label="默认返回值 (Default Value)"
          valuePropName="checked"
          tooltip="当规则评估未命中任何灰度条件时回退的布尔返回值"
        >
          <Switch checkedChildren="true" unCheckedChildren="false" />
        </Form.Item>
      </Form>
    </Drawer>
  );
};
